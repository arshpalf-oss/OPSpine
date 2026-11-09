"""Backup export and import.

Export produces a portable JSON document of the user's own data. Secrets are
excluded by default: API keys never leave the machine inside a backup file
unless the user explicitly asks for them.

Import validates structure *before* touching the database, and runs inside a
single transaction so a bad file cannot leave the database half-written.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Tuple

from .. import db
from ..db import SECRET_SETTING_KEYS

VERSION = 1

#: Tables exported, in an order safe for re-insertion.
TABLES: List[str] = [
    "settings",
    "conversations",
    "messages",
    "drafts",
    "events",
    "tasks",
    "boards",
    "research_sessions",
    "research_results",
    "research_notes",
    "documents",
    "activity",
]

#: Columns that should never appear in a backup unless asked for.
NEVER_EXPORT_COLUMNS = {"filename"}


class BackupError(Exception):
    """Raised for an unusable backup file."""


def export(include_secrets: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "app": "OPSpine",
        "version": VERSION,
        "exported_at": time.time(),
        "includes_secrets": bool(include_secrets),
        "tables": {},
    }
    with db.session() as conn:
        for table in TABLES:
            rows = [dict(r) for r in conn.execute(f"SELECT * FROM {table}").fetchall()]
            if table == "settings" and not include_secrets:
                rows = [r for r in rows if r["key"] not in SECRET_SETTING_KEYS]
            if table == "documents":
                # File names are an implementation detail of this machine.
                for row in rows:
                    for column in NEVER_EXPORT_COLUMNS:
                        row.pop(column, None)
                    row["file_present"] = False
            payload["tables"][table] = rows
    return payload


def validate(payload: Any) -> Dict[str, Any]:
    """Check the shape of an uploaded backup without writing anything."""
    if not isinstance(payload, dict):
        raise BackupError("The file is not a JSON object.")
    if payload.get("app") != "OPSpine":
        raise BackupError("This file was not exported by OPSpine.")
    if payload.get("version") != VERSION:
        raise BackupError(
            f"Unsupported backup version {payload.get('version')!r}. Expected {VERSION}."
        )
    tables = payload.get("tables")
    if not isinstance(tables, dict):
        raise BackupError("The backup is missing its 'tables' section.")

    summary = {}
    for table in TABLES:
        rows = tables.get(table, [])
        if not isinstance(rows, list):
            raise BackupError(f"Table '{table}' is not a list of rows.")
        for row in rows:
            if not isinstance(row, dict):
                raise BackupError(f"Table '{table}' contains a row that is not an object.")
        summary[table] = len(rows)
    return {"summary": summary, "exported_at": payload.get("exported_at")}


def _columns(conn, table: str) -> List[str]:
    return [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def import_payload(payload: Any, replace: bool = True) -> Dict[str, int]:
    """Restore a validated backup. Returns per-table row counts restored."""
    validate(payload)
    tables: Dict[str, List[Dict[str, Any]]] = payload["tables"]
    restored: Dict[str, int] = {}

    conn = db.connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if replace:
            # Children first so foreign keys stay satisfied.
            for table in reversed(TABLES):
                conn.execute(f"DELETE FROM {table}")

        for table in TABLES:
            allowed = set(_columns(conn, table))
            count = 0
            for row in tables.get(table, []):
                data = {k: v for k, v in row.items() if k in allowed}
                if not data:
                    continue
                columns = list(data)
                placeholders = ",".join("?" for _ in columns)
                conn.execute(
                    f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
                    [data[c] for c in columns],
                )
                count += 1
            restored[table] = count
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise BackupError(f"Import failed and was rolled back: {exc}") from exc
    finally:
        conn.close()

    # Restored document rows point at files from the machine that made the
    # backup. The Library reports a missing file for each, which is honest.
    return restored


def preview_text(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, indent=2)[:400]


def export_bytes(include_secrets: bool = False) -> Tuple[bytes, str]:
    payload = export(include_secrets=include_secrets)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    return json.dumps(payload, indent=2).encode("utf-8"), f"opspine-backup-{stamp}.json"
