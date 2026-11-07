"""OPSpine SQLite database layer - single source of truth."""
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DATA_DIR / "opspine.db"

def get_db() -> sqlite3.Connection:
    """Get a database connection with row factory."""
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
    workspace TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    last_visit REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    start_time REAL NOT NULL,
    end_time REAL,
    all_day INTEGER DEFAULT 0,
    recurring TEXT,
    priority TEXT DEFAULT 'normal',
    source TEXT DEFAULT 'kronos',
    done INTEGER DEFAULT 0,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    query TEXT NOT NULL,
    mode TEXT DEFAULT 'quick',
    verdict TEXT,
    confidence REAL,
    summary TEXT,
    evidence TEXT,
    citations TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    description TEXT,
    metadata TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nodes TEXT DEFAULT '[]',
    edges TEXT DEFAULT '[]',
    viewport TEXT DEFAULT '{"x":0,"y":0,"zoom":1}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'normal',
    owner TEXT,
    due_date REAL,
    board_id INTEGER,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    label TEXT,
    FOREIGN KEY (source_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL,
    messages TEXT DEFAULT '[]',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    shortcut TEXT,
    workspace TEXT,
    action TEXT NOT NULL,
    icon TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    outcome TEXT DEFAULT 'success',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    source TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT,
    read INTEGER DEFAULT 0,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER DEFAULT 0,
    created_at REAL NOT NULL
);
"""

def init_db():
    """Initialize database schema and seed defaults."""
    conn = get_db()
    conn.executescript(SCHEMA)
    
    # Default settings
    defaults = {
        "motion_preset": "liquid",
        "nav_mode": "expanded",
        "theme": "auto",
        "local_only": "true",
        "timezone": "UTC",
        "user_name": "Operator",
        "ai_gemini_key": "",
        "ai_groq_key": "",
        "ai_openrouter_key": "",
        "ai_brave_key": "",
        "ai_tavily_key": "",
        "ai_exa_key": "",
    }
    now = time.time()
    for key, val in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
            (key, val, now)
        )
    
    # Seed sample knowledge
    existing = conn.execute("SELECT COUNT(*) FROM knowledge").fetchone()[0]
    if existing == 0:
        sample_knowledge = [
            ("Welcome to OPSpine", "OPSpine is your local-first operating spine for knowledge work. Eight specialist rooms, one AI core, zero cloud dependency.", "[welcome,guide]", None),
            ("Keyboard Shortcuts", "⌘K: Command palette · ⌘0: Dashboard · ⌘1-8: Jump to workspace · ?: Shortcut help · Esc: Close overlay", "[shortcuts]", None),
            ("Offline Operation", "OPSpine runs fully offline with local deterministic engines. Add API keys in Settings to enable cloud AI providers.", "[offline,ai]", None),
        ]
        for title, content, tags, source in sample_knowledge:
            conn.execute(
                "INSERT INTO knowledge (title, content, tags, source, created_at) VALUES (?, ?, ?, ?, ?)",
                (title, content, tags, source, now)
            )
    
    # Seed sample commands
    existing_cmds = conn.execute("SELECT COUNT(*) FROM commands").fetchone()[0]
    if existing_cmds == 0:
        cmds = [
            ("Dashboard", "⌘0", None, "nav:dashboard", "home"),
            ("Abyss", "⌘1", None, "nav:abyss", "sparkles"),
            ("Scout", "⌘2", None, "nav:scout", "search"),
            ("Forge", "⌘3", None, "nav:forge", "hammer"),
            ("Quill", "⌘4", None, "nav:quill", "pen"),
            ("Kronos", "⌘5", None, "nav:kronos", "calendar"),
            ("Whiteboard", "⌘6", None, "nav:whiteboard", "nodes"),
            ("Dash", "⌘7", None, "nav:dash", "zap"),
            ("Working Board", "⌘8", None, "nav:working-board", "board"),
            ("New Brief", None, "scout", "scout:new", "file-plus"),
            ("New Document", None, "forge", "forge:new", "file-plus"),
            ("New Draft", None, "quill", "quill:new", "file-plus"),
            ("New Event", None, "kronos", "kronos:new", "plus"),
            ("New Task", None, "working-board", "board:new", "plus"),
            ("Open Library", None, None, "nav:library", "folder"),
            ("Settings", None, None, "nav:settings", "settings"),
            ("Toggle Nav", None, None, "nav:toggle", "menu"),
            ("Backup Data", None, None, "system:backup", "download"),
        ]
        for name, shortcut, workspace, action, icon in cmds:
            conn.execute(
                "INSERT INTO commands (name, shortcut, workspace, action, icon, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (name, shortcut, workspace, action, icon, now)
            )
    
    conn.commit()
    conn.close()


def get_setting(key: str, default: Any = None) -> Any:
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row is None:
        return default
    val = row["value"]
    # Try to parse as JSON, fall back to string
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return val


def set_setting(key: str, value: Any):
    conn = get_db()
    val = json.dumps(value) if not isinstance(value, str) else value
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        (key, val, time.time())
    )
    conn.commit()
    conn.close()


def log_activity(workspace: str, action: str, detail: str = None):
    conn = get_db()
    conn.execute(
        "INSERT INTO activity (workspace, action, detail, created_at) VALUES (?, ?, ?, ?)",
        (workspace, action, detail, time.time())
    )
    conn.commit()
    conn.close()


def record_visit(workspace: str):
    conn = get_db()
    now = time.time()
    conn.execute(
        "INSERT INTO visits (workspace, count, last_visit) VALUES (?, 1, ?) "
        "ON CONFLICT(workspace) DO UPDATE SET count = count + 1, last_visit = ?",
        (workspace, now, now)
    )
    conn.commit()
    conn.close()


def get_recent_activity(limit: int = 20) -> List[Dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM activity ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_visits() -> List[Dict]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM visits ORDER BY count DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def backup_all() -> Dict:
    """Export all data as v2 backup JSON."""
    conn = get_db()
    tables = {}
    for tbl in [
        "settings", "activity", "visits", "events", "briefs", "documents",
        "drafts", "boards", "tasks", "task_links", "conversations",
        "commands", "ai_usage", "knowledge", "inbox", "uploads"
    ]:
        rows = conn.execute(f"SELECT * FROM {tbl}").fetchall()
        tables[tbl] = [dict(r) for r in rows]
    conn.close()
    return {
        "version": 2,
        "exported_at": time.time(),
        "tables": tables
    }


def restore_all(data: Dict) -> bool:
    """Restore from v2 backup."""
    if data.get("version") != 2:
        return False
    conn = get_db()
    try:
        for tbl, rows in data.get("tables", {}).items():
            conn.execute(f"DELETE FROM {tbl}")
            if rows:
                cols = list(rows[0].keys())
                placeholders = ",".join("?" for _ in cols)
                col_str = ",".join(cols)
                for row in rows:
                    vals = [row[c] for c in cols]
                    conn.execute(
                        f"INSERT INTO {tbl} ({col_str}) VALUES ({placeholders})",
                        vals
                    )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()
