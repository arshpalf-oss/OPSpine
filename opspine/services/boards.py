"""Whiteboard storage.

A board is a JSON document of nodes and links plus its own viewport. The shapes
are validated at the API boundary; this module only persists what it is given.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from .. import db


def list_boards() -> List[Dict[str, Any]]:
    boards = db.rows(
        "SELECT id, name, data, created_at, updated_at FROM boards "
        "ORDER BY updated_at DESC"
    )
    for board in boards:
        data = json.loads(board.pop("data", "{}") or "{}")
        board["node_count"] = len(data.get("nodes", []))
        board["link_count"] = len(data.get("links", []))
    return boards


def get_board(board_id: int) -> Optional[Dict[str, Any]]:
    board = db.one("SELECT * FROM boards WHERE id = ?", (board_id,))
    if board:
        board["data"] = json.loads(board["data"] or "{}")
    return board


def create_board(name: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    now = time.time()
    board_id = db.execute(
        "INSERT INTO boards (name, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (name[:120] or "Untitled board", json.dumps(data or {"nodes": [], "links": []}), now, now),
    )
    return get_board(board_id) or {}


def save_board(board_id: int, *, name: Optional[str] = None,
               data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    if get_board(board_id) is None:
        return None
    if name is not None:
        db.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE id = ?",
            (name[:120] or "Untitled board", time.time(), board_id),
        )
    if data is not None:
        db.execute(
            "UPDATE boards SET data = ?, updated_at = ? WHERE id = ?",
            (json.dumps(data), time.time(), board_id),
        )
    return get_board(board_id)


def delete_board(board_id: int) -> bool:
    db.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    return get_board(board_id) is None
