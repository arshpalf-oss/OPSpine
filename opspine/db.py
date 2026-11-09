"""SQLite persistence for OPSpine.

One database file, one place that knows how to open it. Every query in the
application goes through a connection created here so that:
  * foreign keys stay on for all connections,
  * WAL mode is used so a read does not block a write,
  * rows are returned as mappings rather than tuples.

Initialisation is idempotent: running ``init_db()`` against a fresh directory or
against an existing database both work, and schema changes are applied through
an ordered migration list keyed on ``PRAGMA user_version``.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("OPSPINE_DATA_DIR", APP_ROOT / "data")).resolve()
DOCUMENTS_DIR = DATA_DIR / "documents"
DB_PATH = Path(os.environ.get("OPSPINE_DB_PATH", DATA_DIR / "opspine.db")).resolve()

#: Serialises schema work; SQLite itself handles cross-process locking.
_init_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
# Kept as an ordered list of (version, [statements]). A new version is appended
# rather than editing an old one so existing installs upgrade in place.
MIGRATIONS: List[tuple] = [
    (
        1,
        [
            """
            CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT,
                updated_at REAL NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS messages (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL
                                REFERENCES conversations(id) ON DELETE CASCADE,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                source          TEXT,
                created_at      REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_messages_conversation "
            "ON messages(conversation_id, id)",
            """
            CREATE TABLE IF NOT EXISTS drafts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                content    TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                notes      TEXT NOT NULL DEFAULT '',
                start_at   REAL NOT NULL,
                end_at     REAL NOT NULL,
                all_day    INTEGER NOT NULL DEFAULT 0,
                done       INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at)",
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status      TEXT NOT NULL DEFAULT 'todo',
                priority    TEXT NOT NULL DEFAULT 'normal',
                due_date    TEXT,
                position    REAL NOT NULL DEFAULT 0,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position)",
            """
            CREATE TABLE IF NOT EXISTS boards (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                data       TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                question   TEXT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'no_provider',
                summary    TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_results (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL
                           REFERENCES research_sessions(id) ON DELETE CASCADE,
                title      TEXT NOT NULL,
                url        TEXT NOT NULL DEFAULT '',
                snippet    TEXT NOT NULL DEFAULT '',
                provider   TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_results_session "
            "ON research_results(session_id)",
            """
            CREATE TABLE IF NOT EXISTS research_notes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL
                           REFERENCES research_sessions(id) ON DELETE CASCADE,
                body       TEXT NOT NULL,
                kind       TEXT NOT NULL DEFAULT 'note',
                url        TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_notes_session "
            "ON research_notes(session_id)",
            """
            CREATE TABLE IF NOT EXISTS documents (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                format     TEXT NOT NULL,
                filename   TEXT NOT NULL,
                bytes      INTEGER NOT NULL DEFAULT 0,
                options    TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_documents_created "
            "ON documents(created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS activity (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace  TEXT NOT NULL,
                label      TEXT NOT NULL,
                target     TEXT,
                created_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_activity_created "
            "ON activity(created_at DESC)",
        ],
    ),
]

#: Defaults are strings; the settings service coerces on read.
DEFAULT_SETTINGS: Dict[str, str] = {
    "local_only": "1",
    "motion": "liquid",
    "sidebar_collapsed": "0",
    "tools_collapsed": "0",
    "display_name": "",
    "timezone": "UTC",
    "last_workspace": "/dashboard",
    # Provider configuration. Keys live only on disk; see opspine/providers.py.
    "provider_ai": "none",
    "provider_search": "none",
    "key_gemini": "",
    "key_groq": "",
    "key_openrouter": "",
    "key_brave": "",
    "key_tavily": "",
}

SECRET_SETTING_KEYS = tuple(k for k in DEFAULT_SETTINGS if k.startswith("key_") or k.endswith("_key"))


# --------------------------------------------------------------------------- #
# Connections
# --------------------------------------------------------------------------- #
def connect() -> sqlite3.Connection:
    """Open a configured connection. Caller owns closing it."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    """Transactional connection: commits on success, rolls back on error."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create/upgrade the schema and ensure default settings exist."""
    with _init_lock:
        with session() as conn:
            current = conn.execute("PRAGMA user_version").fetchone()[0]
            for version, statements in MIGRATIONS:
                if version <= current:
                    continue
                for statement in statements:
                    conn.execute(statement)
                conn.execute(f"PRAGMA user_version = {int(version)}")

            now = time.time()
            for key, value in DEFAULT_SETTINGS.items():
                conn.execute(
                    "INSERT OR IGNORE INTO settings (key, value, updated_at) "
                    "VALUES (?, ?, ?)",
                    (key, value, now),
                )


def db_health() -> Dict[str, Any]:
    """Small diagnostic used by the health endpoint and tests."""
    with session() as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        tables = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
    return {"path": str(DB_PATH), "user_version": version, "tables": tables}


# --------------------------------------------------------------------------- #
# Small helpers used by services
# --------------------------------------------------------------------------- #
def rows(query: str, params: Iterable[Any] = ()) -> List[Dict[str, Any]]:
    with session() as conn:
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


def one(query: str, params: Iterable[Any] = ()) -> Optional[Dict[str, Any]]:
    got = rows(query, params)
    return got[0] if got else None


def scalar(query: str, params: Iterable[Any] = ()) -> Any:
    with session() as conn:
        row = conn.execute(query, tuple(params)).fetchone()
        return None if row is None else row[0]


def execute(query: str, params: Iterable[Any] = ()) -> int:
    """Run a write statement, returning lastrowid."""
    with session() as conn:
        cur = conn.execute(query, tuple(params))
        return int(cur.lastrowid or 0)
