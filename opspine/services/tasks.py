"""Working Board task storage."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .. import db

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "normal", "high")


def list_tasks(status: str = "", query: str = "") -> List[Dict[str, Any]]:
    clauses, params = [], []
    if status and status in STATUSES:
        clauses.append("status = ?")
        params.append(status)
    if query:
        clauses.append("(title LIKE ? OR description LIKE ?)")
        params.extend([f"%{query}%", f"%{query}%"])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return db.rows(
        f"SELECT * FROM tasks {where} "
        "ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, "
        "position, created_at",
        params,
    )


def get_task(task_id: int) -> Optional[Dict[str, Any]]:
    return db.one("SELECT * FROM tasks WHERE id = ?", (task_id,))


def create_task(payload: Dict[str, Any]) -> Dict[str, Any]:
    now = time.time()
    next_position = db.scalar("SELECT COALESCE(MAX(position), 0) + 1 FROM tasks") or 1
    task_id = db.execute(
        "INSERT INTO tasks (title, description, status, priority, due_date, "
        "position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            payload["title"], payload.get("description", ""),
            payload.get("status", "todo"), payload.get("priority", "normal"),
            payload.get("due_date"), next_position, now, now,
        ),
    )
    return get_task(task_id) or {}


def update_task(task_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current = get_task(task_id)
    if current is None:
        return None
    merged = {**current, **{k: v for k, v in payload.items() if v is not None}}
    db.execute(
        "UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, "
        "due_date = ?, updated_at = ? WHERE id = ?",
        (
            merged["title"], merged.get("description") or "",
            merged.get("status", "todo"), merged.get("priority", "normal"),
            merged.get("due_date"), time.time(), task_id,
        ),
    )
    return get_task(task_id)


def delete_task(task_id: int) -> bool:
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return get_task(task_id) is None


def counts() -> Dict[str, int]:
    result = {status: 0 for status in STATUSES}
    for row in db.rows("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status"):
        if row["status"] in result:
            result[row["status"]] = row["n"]
    result["total"] = sum(result[s] for s in STATUSES)
    return result
