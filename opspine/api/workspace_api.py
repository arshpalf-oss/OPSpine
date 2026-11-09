"""APIs for Scout, Forge, Quill, Kronos, Whiteboard, Working Board and Library.

Each workspace has a small, explicit surface. Validation happens here; storage
happens in ``opspine.services``.
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any, Dict, List

from flask import Blueprint, request, send_file

from .. import safety, validation
from ..services import (
    activity, boards, documents, drafts, kronos, research, tasks,
)
from .responses import ApiError, ok

scout_bp = Blueprint("scout", __name__, url_prefix="/api/scout")
forge_bp = Blueprint("forge", __name__, url_prefix="/api/forge")
quill_bp = Blueprint("quill", __name__, url_prefix="/api/quill")
kronos_bp = Blueprint("kronos", __name__, url_prefix="/api/kronos")
board_bp = Blueprint("board", __name__, url_prefix="/api/whiteboard")
tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")
library_bp = Blueprint("library", __name__, url_prefix="/api/library")


# --------------------------------------------------------------------------- #
# Scout
# --------------------------------------------------------------------------- #
@scout_bp.get("/sessions")
def scout_list():
    query = request.args.get("q", "").strip()[:200]
    return ok(sessions=research.list_sessions(query), capability=research.capability())


@scout_bp.post("/sessions")
def scout_create():
    data = validation.payload(request.get_json(silent=True))
    question = validation.text(
        data, "question", required=True, max_len=400, label="Research question"
    )
    session = research.create_session(question)
    activity.record("scout", f"Started research: {question[:60]}", f"/scout?session={session['id']}")
    return ok(session=session, capability=research.capability(), status=201)


@scout_bp.get("/sessions/<int:session_id>")
def scout_read(session_id: int):
    session = research.get_session(session_id)
    if session is None:
        raise ApiError("That research session no longer exists.", 404)
    return ok(session=session, capability=research.capability())


@scout_bp.delete("/sessions/<int:session_id>")
def scout_delete(session_id: int):
    if not research.delete_session(session_id):
        raise ApiError("That research session no longer exists.", 404)
    return ok(message="Research session deleted.")


@scout_bp.post("/sessions/<int:session_id>/search")
def scout_search(session_id: int):
    try:
        session = research.run_search(session_id)
    except LookupError as exc:
        raise ApiError(str(exc), 404)
    found = len(session.get("results", []))
    activity.record(
        "scout",
        f"Searched “{session['question'][:60]}” — {found} result"
        f"{'' if found == 1 else 's'}",
    )
    return ok(session=session, capability=research.capability())


@scout_bp.post("/sessions/<int:session_id>/notes")
def scout_add_note(session_id: int):
    if research.get_session(session_id) is None:
        raise ApiError("That research session no longer exists.", 404)
    data = validation.payload(request.get_json(silent=True))
    kind = validation.choice(data, "kind", ("note", "link"), default="note")
    body = validation.text(data, "body", required=True, max_len=8000, label="Note")
    url = validation.url(data, "url")
    if kind == "link" and not url:
        raise ApiError("A saved link needs a URL.", 400, field="url")
    note = research.add_note(session_id, body, kind=kind, url=url)
    activity.record("scout", "Saved a research note")
    return ok(note=note, status=201)


@scout_bp.delete("/notes/<int:note_id>")
def scout_delete_note(note_id: int):
    if not research.delete_note(note_id):
        raise ApiError("That note no longer exists.", 404)
    return ok(message="Note deleted.")


# --------------------------------------------------------------------------- #
# Forge
# --------------------------------------------------------------------------- #
@forge_bp.get("/formats")
def forge_formats():
    return ok(formats=[{"id": k, "label": v} for k, v in documents.SUPPORTED.items()])


@forge_bp.get("/documents")
def forge_list():
    query = request.args.get("q", "").strip()[:200]
    return ok(documents=documents.list_documents(query))


@forge_bp.post("/documents")
def forge_create():
    data = validation.payload(request.get_json(silent=True))
    fmt = validation.choice(data, "format", documents.SUPPORTED.keys())
    title = validation.text(data, "title", required=True, max_len=160, label="Title")
    body = validation.text(
        data, "body", required=True, max_len=documents.MAX_BODY, label="Content"
    )

    options: Dict[str, Any] = {}
    if fmt == "pdf":
        options["page_size"] = validation.choice(
            data, "page_size", ("A4", "LETTER"), default="A4"
        )
        options["author"] = validation.text(data, "author", max_len=80, label="Author")
    elif fmt in ("docx", "pptx", "md"):
        options["author"] = validation.text(data, "author", max_len=80, label="Author")
    if fmt == "pptx":
        options["subtitle"] = validation.text(
            data, "subtitle", max_len=160, label="Subtitle"
        )
    if fmt == "png":
        options["width"] = validation.integer(
            {"width": data.get("width", 1280)}, "width",
            default=1280, minimum=320, maximum=4000,
        )
        options["height"] = validation.integer(
            {"height": data.get("height", 720)}, "height",
            default=720, minimum=320, maximum=4000,
        )
        options["accent"] = validation.colour(data.get("accent"), default="#7b9cff")

    try:
        record = documents.generate(fmt, title, body, options)
    except documents.DocumentError as exc:
        raise ApiError(str(exc), 400)

    activity.record(
        "forge",
        f"Created {fmt.upper()}: {title[:60]}",
        f"/library?highlight={record['id']}",
    )
    return ok(document=record, status=201)


# Downloads and deletes live in library_bp so there is one file-serving path.
@library_bp.get("/documents/<int:doc_id>/file")
def library_download(doc_id: int):
    record = documents.get_document(doc_id)
    if record is None:
        raise ApiError("That document is not in the library.", 404)
    try:
        path = safety.resolve_existing(record["filename"])
    except safety.UnsafePathError as exc:
        raise ApiError(
            f"The file for this record is unavailable ({exc}). Generate it again.",
            410,
        )
    return send_file(
        str(path),
        as_attachment=True,
        download_name=f"{safety.slug(record['title'])}.{record['format']}",
        max_age=0,
    )


@library_bp.delete("/documents/<int:doc_id>")
def library_delete(doc_id: int):
    if not documents.delete_document(doc_id):
        raise ApiError("That document is not in the library.", 404)
    activity.record("library", "Deleted a generated file")
    return ok(message="File deleted.")


# --------------------------------------------------------------------------- #
# Quill
# --------------------------------------------------------------------------- #
@quill_bp.get("/drafts")
def quill_list():
    query = request.args.get("q", "").strip()[:200]
    return ok(drafts=drafts.list_drafts(query))


@quill_bp.post("/drafts")
def quill_create():
    data = request.get_json(silent=True) or {}
    title = validation.text(data, "title", default="Untitled draft", max_len=160)
    content = validation.text(
        data, "content", default="", max_len=200_000, label="Content"
    )
    draft = drafts.create_draft(title or "Untitled draft", content)
    activity.record("quill", f"Started draft: {draft['title'][:60]}")
    return ok(draft=draft, status=201)


@quill_bp.get("/drafts/<int:draft_id>")
def quill_read(draft_id: int):
    draft = drafts.get_draft(draft_id)
    if draft is None:
        raise ApiError("That draft no longer exists.", 404)
    return ok(draft=draft)


@quill_bp.put("/drafts/<int:draft_id>")
def quill_update(draft_id: int):
    if drafts.get_draft(draft_id) is None:
        raise ApiError("That draft no longer exists.", 404)
    data = validation.payload(request.get_json(silent=True))
    title = None
    content = None
    if "title" in data:
        title = validation.text(data, "title", max_len=160, label="Title")
    if "content" in data:
        content = validation.text(
            data, "content", max_len=200_000, label="Content"
        )
    draft = drafts.update_draft(draft_id, title=title, content=content)
    return ok(draft=draft)


@quill_bp.delete("/drafts/<int:draft_id>")
def quill_delete(draft_id: int):
    if not drafts.delete_draft(draft_id):
        raise ApiError("That draft no longer exists.", 404)
    activity.record("quill", "Deleted a draft")
    return ok(message="Draft deleted.")


# --------------------------------------------------------------------------- #
# Kronos
# --------------------------------------------------------------------------- #
def _event_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    title = validation.text(data, "title", required=True, max_len=160, label="Title")
    start_at = validation.number(data.get("start_at"), "start_at", minimum=0, maximum=4_102_444_800)
    end_at = validation.number(
        data.get("end_at", start_at + 3600), "end_at", minimum=0, maximum=4_102_444_800
    )
    if end_at <= start_at:
        raise ApiError("The end time must be after the start time.", 400, field="end_at")
    if end_at - start_at > 60 * 60 * 24 * 14:
        raise ApiError("An event cannot be longer than 14 days.", 400, field="end_at")
    return {
        "title": title,
        "notes": validation.text(data, "notes", max_len=4000, label="Notes"),
        "start_at": start_at,
        "end_at": end_at,
        "all_day": validation.boolean(data, "all_day", default=False),
        "done": validation.boolean(data, "done", default=False),
    }


@kronos_bp.get("/events")
def kronos_list():
    start = request.args.get("start", type=float)
    end = request.args.get("end", type=float)
    return ok(events=kronos.list_events(start, end))


@kronos_bp.post("/events")
def kronos_create():
    data = validation.payload(request.get_json(silent=True))
    payload = _event_payload(data)
    event = kronos.create_event(payload)
    clashes = kronos.find_clashes(payload["start_at"], payload["end_at"], event["id"])
    when = datetime.fromtimestamp(payload["start_at"]).strftime("%d %b %H:%M")
    activity.record("kronos", f"Scheduled “{payload['title'][:40]}” ({when})")
    return ok(event=event, clashes=clashes, status=201)


@kronos_bp.put("/events/<int:event_id>")
def kronos_update(event_id: int):
    existing = kronos.get_event(event_id)
    if existing is None:
        raise ApiError("That event no longer exists.", 404)
    data = validation.payload(request.get_json(silent=True))
    # PUT accepts partial updates: unmentioned fields keep their stored values
    # instead of being reset to defaults.
    merged = {
        "title": existing["title"],
        "notes": existing.get("notes", ""),
        "start_at": existing["start_at"],
        "end_at": existing["end_at"],
        "all_day": existing["all_day"],
        "done": existing["done"],
    }
    merged.update(data)
    payload = _event_payload(merged)
    event = kronos.update_event(event_id, payload)
    clashes = kronos.find_clashes(payload["start_at"], payload["end_at"], event_id)
    return ok(event=event, clashes=clashes)


@kronos_bp.delete("/events/<int:event_id>")
def kronos_delete(event_id: int):
    if not kronos.delete_event(event_id):
        raise ApiError("That event no longer exists.", 404)
    activity.record("kronos", "Deleted an event")
    return ok(message="Event deleted.")


@kronos_bp.post("/parse")
def kronos_parse():
    data = validation.payload(request.get_json(silent=True))
    text = validation.text(data, "text", required=True, max_len=300, label="Text")
    try:
        parsed = kronos.parse(text)
    except ValueError as exc:
        raise ApiError(str(exc), 400)
    clashes = kronos.find_clashes(parsed["start_at"], parsed["end_at"])
    return ok(
        parsed=parsed,
        clashes=clashes,
        note=(
            "OPSpine has no background service, so events never notify you "
            "while the app is closed."
        ),
    )


# --------------------------------------------------------------------------- #
# Whiteboard
# --------------------------------------------------------------------------- #
def _validate_board_data(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ApiError("Board data must be an object.", 400, field="data")
    nodes = data.get("nodes", [])
    links = data.get("links", [])
    if not isinstance(nodes, list) or not isinstance(links, list):
        raise ApiError("Board nodes and links must be lists.", 400, field="data")
    if len(nodes) > 400:
        raise ApiError("A board can hold at most 400 notes.", 400, field="data")

    clean_nodes: List[Dict[str, Any]] = []
    seen = set()
    for raw in nodes:
        if not isinstance(raw, dict):
            raise ApiError("Each note must be an object.", 400, field="data")
        node_id = str(raw.get("id", ""))[:40]
        if not node_id or not node_id.replace("-", "").isalnum():
            raise ApiError("Each note needs a simple id.", 400, field="data")
        if node_id in seen:
            continue
        seen.add(node_id)
        clean_nodes.append(
            {
                "id": node_id,
                "text": validation.text(raw, "text", max_len=600, label="Note text"),
                "x": validation.number(raw.get("x", 0), "x", minimum=-20000, maximum=20000),
                "y": validation.number(raw.get("y", 0), "y", minimum=-20000, maximum=20000),
                "color": validation.colour(raw.get("color"), default="#c4a1ff"),
            }
        )

    clean_links = []
    for raw in links[:800]:
        if not isinstance(raw, dict):
            continue
        source, target = str(raw.get("from", "")), str(raw.get("to", ""))
        if source in seen and target in seen and source != target:
            clean_links.append({"from": source, "to": target})

    viewport = data.get("viewport") if isinstance(data.get("viewport"), dict) else {}
    return {
        "nodes": clean_nodes,
        "links": clean_links,
        "viewport": {
            "x": validation.number(viewport.get("x", 0), "x", minimum=-50000, maximum=50000),
            "y": validation.number(viewport.get("y", 0), "y", minimum=-50000, maximum=50000),
            "zoom": validation.number(viewport.get("zoom", 1), "zoom", minimum=0.25, maximum=3),
        },
    }


@board_bp.get("/boards")
def boards_list():
    return ok(boards=boards.list_boards())


@board_bp.post("/boards")
def boards_create():
    data = request.get_json(silent=True) or {}
    name = validation.text(data, "name", default="Untitled board", max_len=120)
    board = boards.create_board(name or "Untitled board", _validate_board_data({"nodes": [], "links": []}))
    activity.record("whiteboard", f"Created board: {board['name'][:50]}")
    return ok(board=board, status=201)


@board_bp.get("/boards/<int:board_id>")
def boards_read(board_id: int):
    board = boards.get_board(board_id)
    if board is None:
        raise ApiError("That board no longer exists.", 404)
    return ok(board=board)


@board_bp.put("/boards/<int:board_id>")
def boards_save(board_id: int):
    if boards.get_board(board_id) is None:
        raise ApiError("That board no longer exists.", 404)
    data = validation.payload(request.get_json(silent=True))
    name = None
    if "name" in data:
        name = validation.text(data, "name", max_len=120, label="Board name")
    board_data = _validate_board_data(data.get("data", {}))
    board = boards.save_board(board_id, name=name or None, data=board_data)
    return ok(board=board)


@board_bp.delete("/boards/<int:board_id>")
def boards_delete(board_id: int):
    if not boards.delete_board(board_id):
        raise ApiError("That board no longer exists.", 404)
    activity.record("whiteboard", "Deleted a board")
    return ok(message="Board deleted.")


# --------------------------------------------------------------------------- #
# Working Board
# --------------------------------------------------------------------------- #
@tasks_bp.get("/")
def tasks_list():
    status = request.args.get("status", "").strip()
    query = request.args.get("q", "").strip()[:200]
    return ok(tasks=tasks.list_tasks(status, query), counts=tasks.counts())


@tasks_bp.post("/")
def tasks_create():
    data = validation.payload(request.get_json(silent=True))
    payload = {
        "title": validation.text(data, "title", required=True, max_len=160, label="Title"),
        "description": validation.text(data, "description", max_len=4000, label="Description"),
        "status": validation.choice(data, "status", tasks.STATUSES, default="todo"),
        "priority": validation.choice(data, "priority", tasks.PRIORITIES, default="normal"),
        "due_date": _due_date(data),
    }
    task = tasks.create_task(payload)
    activity.record("working-board", f"Added task: {task['title'][:60]}")
    return ok(task=task, counts=tasks.counts(), status=201)


def _due_date(data: Dict[str, Any]):
    value = data.get("due_date")
    if value in (None, ""):
        return None
    value = str(value).strip()[:10]
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise ApiError("Due date must look like 2026-11-09.", 400, field="due_date")
    return value


@tasks_bp.put("/<int:task_id>")
def tasks_update(task_id: int):
    if tasks.get_task(task_id) is None:
        raise ApiError("That task no longer exists.", 404)
    data = validation.payload(request.get_json(silent=True))
    payload: Dict[str, Any] = {}
    if "title" in data:
        payload["title"] = validation.text(data, "title", required=True, max_len=160, label="Title")
    if "description" in data:
        payload["description"] = validation.text(data, "description", max_len=4000, label="Description")
    if "status" in data:
        payload["status"] = validation.choice(data, "status", tasks.STATUSES)
    if "priority" in data:
        payload["priority"] = validation.choice(data, "priority", tasks.PRIORITIES)
    if "due_date" in data:
        payload["due_date"] = _due_date(data)
    task = tasks.update_task(task_id, payload)
    activity.record("working-board", f"Updated task: {task['title'][:50]}")
    return ok(task=task, counts=tasks.counts())


@tasks_bp.delete("/<int:task_id>")
def tasks_delete(task_id: int):
    if not tasks.delete_task(task_id):
        raise ApiError("That task no longer exists.", 404)
    activity.record("working-board", "Deleted a task")
    return ok(message="Task deleted.", counts=tasks.counts())


# --------------------------------------------------------------------------- #
# Library
# --------------------------------------------------------------------------- #
@library_bp.get("/")
def library_index():
    query = request.args.get("q", "").strip()[:200]
    from ..services import conversations, drafts as drafts_service, research as research_service

    documents_list = documents.list_documents(query)
    return ok(
        documents=documents_list,
        drafts=drafts_service.list_drafts(query),
        research=research_service.list_sessions(query),
        conversations=conversations.list_conversations(query),
        counts={
            "documents": len(documents_list),
            "missing_files": sum(1 for d in documents_list if d["missing"]),
            "drafts": len(drafts_service.list_drafts(query)),
        },
    )


BLUEPRINTS = [
    scout_bp, forge_bp, quill_bp, kronos_bp, board_bp, tasks_bp, library_bp,
]
