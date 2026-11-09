"""Quill draft storage."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .. import db
from .localtext import word_count


def list_drafts(query: str = "") -> List[Dict[str, Any]]:
    if query:
        like = f"%{query}%"
        drafts = db.rows(
            "SELECT id, title, content, created_at, updated_at FROM drafts "
            "WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
            (like, like),
        )
    else:
        drafts = db.rows(
            "SELECT id, title, content, created_at, updated_at FROM drafts "
            "ORDER BY updated_at DESC"
        )
    for draft in drafts:
        draft["words"] = word_count(draft["content"])
        # The list does not need full bodies; keep payloads small.
        draft["excerpt"] = " ".join(draft["content"].split())[:120]
        draft.pop("content", None)
    return drafts


def get_draft(draft_id: int) -> Optional[Dict[str, Any]]:
    draft = db.one(
        "SELECT id, title, content, created_at, updated_at FROM drafts WHERE id = ?",
        (draft_id,),
    )
    if draft:
        draft["words"] = word_count(draft["content"])
    return draft


def create_draft(title: str = "Untitled draft", content: str = "") -> Dict[str, Any]:
    now = time.time()
    draft_id = db.execute(
        "INSERT INTO drafts (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (title[:160] or "Untitled draft", content, now, now),
    )
    return get_draft(draft_id) or {}


def update_draft(draft_id: int, *, title: Optional[str] = None,
                 content: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if get_draft(draft_id) is None:
        return None
    if title is not None:
        db.execute(
            "UPDATE drafts SET title = ?, updated_at = ? WHERE id = ?",
            (title[:160] or "Untitled draft", time.time(), draft_id),
        )
    if content is not None:
        db.execute(
            "UPDATE drafts SET content = ?, updated_at = ? WHERE id = ?",
            (content, time.time(), draft_id),
        )
    return get_draft(draft_id)


def delete_draft(draft_id: int) -> bool:
    db.execute("DELETE FROM drafts WHERE id = ?", (draft_id,))
    return get_draft(draft_id) is None
