"""Real usage records for the dashboard, sidebar and Dash.

Only things the user actually did are written here. Nothing is seeded.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from .. import db

#: Workspace label lookup shared by the UI.
WORKSPACE_LABELS = {
    "dashboard": "Dashboard",
    "abyss": "Abyss",
    "scout": "Scout",
    "forge": "Forge",
    "quill": "Quill",
    "kronos": "Kronos",
    "whiteboard": "Whiteboard",
    "dash": "Dash",
    "working-board": "Working Board",
    "library": "Library",
    "settings": "Settings",
}

MAX_ROWS = 400


def record(workspace: str, label: str, target: str = "") -> None:
    """Log one completed user action."""
    if workspace not in WORKSPACE_LABELS:
        return
    db.execute(
        "INSERT INTO activity (workspace, label, target, created_at) "
        "VALUES (?, ?, ?, ?)",
        (workspace, label[:200], (target or "")[:300], time.time()),
    )
    _trim()


def _trim() -> None:
    """Keep the table small without needing a separate maintenance task."""
    total = db.scalar("SELECT COUNT(*) FROM activity") or 0
    if total > MAX_ROWS:
        db.execute(
            "DELETE FROM activity WHERE id NOT IN "
            "(SELECT id FROM activity ORDER BY created_at DESC LIMIT ?)",
            (MAX_ROWS,),
        )


def recent(limit: int = 8) -> List[Dict[str, Any]]:
    rows = db.rows(
        "SELECT id, workspace, label, target, created_at FROM activity "
        "ORDER BY created_at DESC LIMIT ?",
        (limit,),
    )
    for row in rows:
        row["workspace_label"] = WORKSPACE_LABELS.get(row["workspace"], row["workspace"])
    return rows


def per_workspace(limit: int = 5) -> List[Dict[str, Any]]:
    rows = db.rows(
        "SELECT workspace, COUNT(*) AS uses, MAX(created_at) AS last_used "
        "FROM activity GROUP BY workspace ORDER BY last_used DESC LIMIT ?",
        (limit,),
    )
    for row in rows:
        row["workspace_label"] = WORKSPACE_LABELS.get(row["workspace"], row["workspace"])
    return rows


def counts() -> Dict[str, int]:
    """Honest counters for Dash: derived from real rows only."""
    day_start = time.time() - 86_400
    return {
        "actions_total": db.scalar("SELECT COUNT(*) FROM activity") or 0,
        "actions_today": db.scalar(
            "SELECT COUNT(*) FROM activity WHERE created_at >= ?", (day_start,)
        ) or 0,
        "documents": db.scalar("SELECT COUNT(*) FROM documents") or 0,
        "drafts": db.scalar("SELECT COUNT(*) FROM drafts") or 0,
        "events": db.scalar("SELECT COUNT(*) FROM events") or 0,
        "tasks": db.scalar("SELECT COUNT(*) FROM tasks") or 0,
        "conversations": db.scalar("SELECT COUNT(*) FROM conversations") or 0,
        "research": db.scalar("SELECT COUNT(*) FROM research_sessions") or 0,
        "boards": db.scalar("SELECT COUNT(*) FROM boards") or 0,
    }


def clear() -> None:
    db.execute("DELETE FROM activity")
