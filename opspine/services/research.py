"""Scout: research sessions, provider results, and user notes.

Two kinds of content are stored and returned separately, never blended:

* **results** — came from a search provider, with title, URL, snippet and the
  provider name. If no provider is available, there are no results.
* **notes** — written by the user, always labelled as user notes.

There is no summariser that invents a verdict. A session can be "searched" or
"notes only", and the UI says which.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .. import db
from . import providers, settings


def list_sessions(query: str = "") -> List[Dict[str, Any]]:
    if query:
        like = f"%{query}%"
        return db.rows(
            "SELECT s.id, s.question, s.status, s.summary, s.created_at, "
            "       s.updated_at, "
            "  (SELECT COUNT(*) FROM research_results r WHERE r.session_id = s.id) AS result_count, "
            "  (SELECT COUNT(*) FROM research_notes n WHERE n.session_id = s.id) AS note_count "
            "FROM research_sessions s WHERE s.question LIKE ? OR s.summary LIKE ? "
            "ORDER BY s.updated_at DESC",
            (like, like),
        )
    return db.rows(
        "SELECT s.id, s.question, s.status, s.summary, s.created_at, s.updated_at, "
        "  (SELECT COUNT(*) FROM research_results r WHERE r.session_id = s.id) AS result_count, "
        "  (SELECT COUNT(*) FROM research_notes n WHERE n.session_id = s.id) AS note_count "
        "FROM research_sessions s ORDER BY s.updated_at DESC"
    )


def get_session(session_id: int) -> Optional[Dict[str, Any]]:
    session = db.one("SELECT * FROM research_sessions WHERE id = ?", (session_id,))
    if session is None:
        return None
    session["results"] = db.rows(
        "SELECT id, title, url, snippet, provider, created_at FROM research_results "
        "WHERE session_id = ? ORDER BY id",
        (session_id,),
    )
    session["notes"] = db.rows(
        "SELECT id, body, kind, url, created_at FROM research_notes "
        "WHERE session_id = ? ORDER BY id",
        (session_id,),
    )
    return session


def create_session(question: str) -> Dict[str, Any]:
    now = time.time()
    session_id = db.execute(
        "INSERT INTO research_sessions (question, status, summary, created_at, "
        "updated_at) VALUES (?, ?, ?, ?, ?)",
        (question[:400], "no_provider", "", now, now),
    )
    return get_session(session_id) or {}


def delete_session(session_id: int) -> bool:
    db.execute("DELETE FROM research_sessions WHERE id = ?", (session_id,))
    return get_session(session_id) is None


def run_search(session_id: int) -> Dict[str, Any]:
    """Ask the configured provider. Raises ProviderError if unavailable."""
    session = get_session(session_id)
    if session is None:
        raise LookupError("That research session no longer exists.")

    payload = providers.search(session["question"])

    # Replace previous provider results so the session reflects one search.
    db.execute(
        "DELETE FROM research_results WHERE session_id = ?", (session_id,)
    )
    now = time.time()
    for result in payload["results"]:
        db.execute(
            "INSERT INTO research_results (session_id, title, url, snippet, "
            "provider, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                session_id, result["title"][:300], result["url"][:2000],
                result["snippet"][:1200], result["provider"], now,
            ),
        )
    status = "searched" if payload["results"] else "no_results"
    db.execute(
        "UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?",
        (status, now, session_id),
    )
    refreshed = get_session(session_id) or {}
    refreshed["provider_used"] = payload["provider"]
    return refreshed


def mark_unavailable(session_id: int) -> Dict[str, Any]:
    """Record honestly that live research could not run."""
    db.execute(
        "UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?",
        ("no_provider", time.time(), session_id),
    )
    return get_session(session_id) or {}


def add_note(session_id: int, body: str, kind: str = "note", url: str = "") -> Dict[str, Any]:
    now = time.time()
    note_id = db.execute(
        "INSERT INTO research_notes (session_id, body, kind, url, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (session_id, body[:8000], kind, url[:2000], now),
    )
    db.execute(
        "UPDATE research_sessions SET updated_at = ? WHERE id = ?",
        (now, session_id),
    )
    return db.one(
        "SELECT id, body, kind, url, created_at FROM research_notes WHERE id = ?",
        (note_id,),
    ) or {}


def delete_note(note_id: int) -> bool:
    db.execute("DELETE FROM research_notes WHERE id = ?", (note_id,))
    return db.one("SELECT id FROM research_notes WHERE id = ?", (note_id,)) is None


def capability() -> Dict[str, Any]:
    """What Scout can honestly promise right now."""
    state = providers.status()
    return {
        "search_available": state["search_available"],
        "provider": state["search_provider"],
        "local_only": state["local_only"],
        "message": (
            "Live web research is unavailable in local-only mode. You can still "
            "record notes and links, which stay on this machine."
            if state["local_only"]
            else (
                "Live web research is ready via " + state["search_provider"] + "."
                if state["search_available"]
                else "No research provider configured. Notes still work offline."
            )
        ),
        "has_key": bool(
            settings.key_for(settings.get("provider_search", "none") or "none")
        ),
    }
