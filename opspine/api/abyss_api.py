"""Abyss API: conversations, messages, and local text tools."""
from __future__ import annotations

from typing import Any, Dict

from flask import Blueprint, request

from .. import validation
from ..services import activity, conversations, localtext, providers
from .responses import ApiError, ok

bp = Blueprint("abyss", __name__, url_prefix="/api/abyss")


def _require_conversation(conversation_id: int) -> Dict[str, Any]:
    found = conversations.get_conversation(conversation_id)
    if found is None:
        raise ApiError("That conversation no longer exists.", 404)
    return found


@bp.get("/conversations")
def list_conversations():
    query = request.args.get("q", "").strip()[:200]
    return ok(
        conversations=conversations.list_conversations(query),
        providers=providers.status(),
    )


@bp.post("/conversations")
def create_conversation():
    data = request.get_json(silent=True) or {}
    title = validation.text(data, "title", default="New conversation", max_len=120)
    return ok(conversation=conversations.create_conversation(title or "New conversation"),
              status=201)


@bp.get("/conversations/<int:conversation_id>")
def read_conversation(conversation_id: int):
    return ok(conversation=_require_conversation(conversation_id),
              providers=providers.status())


@bp.patch("/conversations/<int:conversation_id>")
def rename_conversation(conversation_id: int):
    _require_conversation(conversation_id)
    data = validation.payload(request.get_json(silent=True))
    title = validation.text(data, "title", required=True, max_len=120, label="Title")
    conversations.rename_conversation(conversation_id, title)
    return ok(conversation=conversations.get_conversation(conversation_id))


@bp.delete("/conversations/<int:conversation_id>")
def delete_conversation(conversation_id: int):
    _require_conversation(conversation_id)
    conversations.delete_conversation(conversation_id)
    return ok(message="Conversation deleted.")


@bp.post("/conversations/<int:conversation_id>/messages")
def send_message(conversation_id: int):
    _require_conversation(conversation_id)
    data = validation.payload(request.get_json(silent=True))
    body = validation.text(
        data, "content", required=True, max_len=8000, label="Message"
    )
    use_ai = validation.boolean(data, "use_ai", default=False)

    conversations.add_message(conversation_id, "user", body, "user")
    conversations.maybe_autotitle(conversation_id, body)
    result = conversations.compose_reply(conversation_id, body, use_ai=use_ai)
    conversation = conversations.get_conversation(conversation_id) or {}
    activity.record(
        "abyss", f"Message in \u201c{conversation.get('title', 'conversation')}\u201d"
    )

    return ok(
        reply=result["message"],
        mode=result["mode"],
        provider=result.get("provider"),
        status=providers.status(),
    )


@bp.get("/search")
def search():
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return ok(messages=[])
    return ok(messages=conversations.search_messages(query[:120]))


@bp.get("/tools")
def list_tools():
    return ok(
        tools=[{"id": key, "label": label} for key, label in localtext.TOOLS.items()],
        note=(
            "These run entirely offline on this machine. They are deterministic "
            "text operations, not a language model."
        ),
    )


@bp.post("/tools/run")
def run_tool():
    data = validation.payload(request.get_json(silent=True))
    tool = validation.choice(data, "tool", localtext.TOOLS.keys())
    text = validation.text(data, "text", required=True, max_len=60_000, label="Text")
    try:
        result = conversations.run_local_tool(tool, text)
    except localtext.ToolError as exc:
        raise ApiError(str(exc), 400)
    activity.record("abyss", f"Local tool: {localtext.TOOLS[tool]}")
    return ok(result=result)
