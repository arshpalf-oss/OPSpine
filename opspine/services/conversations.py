"""Conversation storage and the Abyss reply pipeline.

The rule this module enforces: a reply is labelled with where it came from.
``source`` is one of:

* ``provider:<name>``  — genuinely produced by a configured language model
* ``local-tool:<tool>``— produced by a deterministic offline text tool
* ``local-answer``     — an offline *explanation* of the request (not an answer
                         pretending to be intelligence)

If no provider is configured, the assistant says so and offers local tools. It
never composes prose and presents it as a model response.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .. import db
from . import localtext, providers

TITLE_LIMIT = 70


def _now() -> float:
    return time.time()


def list_conversations(query: str = "") -> List[Dict[str, Any]]:
    if query:
        like = f"%{query}%"
        return db.rows(
            "SELECT c.id, c.title, c.created_at, c.updated_at, "
            "  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count "
            "FROM conversations c "
            "WHERE c.title LIKE ? OR EXISTS ("
            "  SELECT 1 FROM messages m2 WHERE m2.conversation_id = c.id "
            "  AND m2.content LIKE ?) "
            "ORDER BY c.updated_at DESC",
            (like, like),
        )
    return db.rows(
        "SELECT c.id, c.title, c.created_at, c.updated_at, "
        "  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count "
        "FROM conversations c ORDER BY c.updated_at DESC"
    )


def get_conversation(conversation_id: int) -> Optional[Dict[str, Any]]:
    conversation = db.one(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
        (conversation_id,),
    )
    if conversation is None:
        return None
    conversation["messages"] = db.rows(
        "SELECT id, role, content, source, created_at FROM messages "
        "WHERE conversation_id = ? ORDER BY id",
        (conversation_id,),
    )
    return conversation


def create_conversation(title: str = "New conversation") -> Dict[str, Any]:
    now = _now()
    new_id = db.execute(
        "INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
        (title[:120] or "New conversation", now, now),
    )
    return {"id": new_id, "title": title, "created_at": now, "updated_at": now,
            "messages": []}


def rename_conversation(conversation_id: int, title: str) -> bool:
    return db.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title[:120], _now(), conversation_id),
    ) >= 0


def delete_conversation(conversation_id: int) -> bool:
    db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    remaining = db.scalar(
        "SELECT COUNT(*) FROM conversations WHERE id = ?", (conversation_id,)
    )
    return remaining == 0


def add_message(conversation_id: int, role: str, content: str, source: str) -> Dict[str, Any]:
    now = _now()
    message_id = db.execute(
        "INSERT INTO messages (conversation_id, role, content, source, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conversation_id, role, content, source, now),
    )
    db.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (now, conversation_id),
    )
    return {"id": message_id, "role": role, "content": content,
            "source": source, "created_at": now}


def maybe_autotitle(conversation_id: int, first_message: str) -> None:
    """Title an untitled conversation from its first user message."""
    current = db.one(
        "SELECT title FROM conversations WHERE id = ?", (conversation_id,)
    )
    if not current or current["title"] not in ("New conversation", "", None):
        return
    title = " ".join(first_message.split())
    if len(title) > TITLE_LIMIT:
        title = title[:TITLE_LIMIT].rsplit(" ", 1)[0] + "…"
    db.execute(
        "UPDATE conversations SET title = ? WHERE id = ?",
        (title or "New conversation", conversation_id),
    )


# --------------------------------------------------------------------------- #
# Reply pipeline
# --------------------------------------------------------------------------- #
LOCAL_TOOL_HINTS = (
    ("word count", "stats"),
    ("count words", "stats"),
    ("statistics", "stats"),
    ("summarise", "summary"),
    ("summarize", "summary"),
    ("summary", "summary"),
    ("key terms", "key_terms"),
    ("keywords", "key_terms"),
    ("bullet", "bullets"),
    ("slug", "slug"),
    ("uppercase", "uppercase"),
    ("lowercase", "lowercase"),
    ("title case", "title_case"),
    ("dedupe", "dedupe_lines"),
    ("sort lines", "sort_lines"),
)

NO_PROVIDER_MESSAGE = (
    "No AI provider is configured, so OPSpine cannot generate an answer. "
    "This is not a limitation of your machine — it is the honest state of the "
    "app. You can:\n\n"
    "• add a Gemini, Groq, or OpenRouter key in Settings, or\n"
    "• use a local tool, which runs offline and is labelled as a local tool.\n\n"
    "Local tools available: word and sentence counts, extractive summary, "
    "key terms, bullets, casing, line sorting and de-duplication, and URL slugs."
)


def _local_tool_suggestion(message: str) -> Optional[Dict[str, Any]]:
    lowered = message.lower()
    for phrase, tool in LOCAL_TOOL_HINTS:
        if phrase in lowered:
            return {"tool": tool, "label": localtext.TOOLS[tool]}
    return None


def compose_reply(conversation_id: int, message: str, *, use_ai: bool = False) -> Dict[str, Any]:
    """Produce a reply, persist it, and describe exactly what produced it."""
    if use_ai and providers.ai_available():
        result = providers.complete(
            message,
            system=(
                "You are OPSpine's assistant. Be concise and concrete. "
                "If you are unsure, say so plainly."
            ),
        )
        reply = add_message(
            conversation_id, "assistant", result["text"],
            f"provider:{result['provider']}",
        )
        return {"message": reply, "mode": "provider", "provider": result["provider"],
                "model": result["model"], "elapsed_ms": result["elapsed_ms"]}

    if use_ai and not providers.ai_available():
        # Explicitly requested AI, but nothing is configured: say so, do not fake it.
        reply = add_message(
            conversation_id, "assistant", NO_PROVIDER_MESSAGE, "system-notice"
        )
        return {"message": reply, "mode": "unavailable",
                "status": providers.status()}

    suggestion = _local_tool_suggestion(message)
    if suggestion:
        tool = suggestion["tool"]
        body = (
            f"`{suggestion['label']}` is a local tool that runs entirely offline. "
            "Paste the text you want processed and run the tool from the panel "
            "below — OPSpine will label the output as a local tool result.\n\n"
            f"Ask for it explicitly with: run {tool} on the text in the editor."
        )
        reply = add_message(
            conversation_id, "assistant", body, f"local-tool:{tool}"
        )
        return {"message": reply, "mode": "local-tool", "tool": tool}

    reply = add_message(
        conversation_id, "assistant", NO_PROVIDER_MESSAGE, "system-notice"
    )
    return {"message": reply, "mode": "unavailable", "status": providers.status()}


def run_local_tool(tool: str, text: str) -> Dict[str, Any]:
    """Thin wrapper so the API has one entry point for local tools."""
    return localtext.run(tool, text)


def search_messages(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    like = f"%{query}%"
    return db.rows(
        "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, "
        "       c.title AS conversation_title "
        "FROM messages m JOIN conversations c ON c.id = m.conversation_id "
        "WHERE m.content LIKE ? ORDER BY m.id DESC LIMIT ?",
        (like, limit),
    )
