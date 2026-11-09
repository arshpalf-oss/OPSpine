"""Shell-level API: bootstrap data, settings, activity, backup, health."""
from __future__ import annotations

import json
from typing import Any, Dict

from flask import Blueprint, Response, request

from .. import db, safety, validation
from ..services import activity, backup, providers, settings
from ..workspaces import WORKSPACES, for_rail
from .responses import ApiError, ok

bp = Blueprint("core", __name__, url_prefix="/api")


@bp.get("/bootstrap")
def bootstrap():
    """Everything the shell needs to paint without extra round trips."""
    state = providers.status()
    return ok(
        workspaces=[
            {
                "key": w["key"], "path": w["path"], "name": w["name"],
                "tagline": w["tagline"], "description": w["description"],
                "shortcut": w["shortcut"], "accent": w["accent"],
                "group": w["group"], "primary_action": w["primary_action"],
            }
            for w in WORKSPACES
        ],
        settings=settings.public_settings(),
        providers=state,
        activity=activity.recent(6),
        counts=activity.counts(),
    )


@bp.get("/settings")
def get_settings():
    return ok(settings=settings.public_settings(), providers=providers.status())


@bp.post("/settings")
def save_settings():
    data = validation.payload(request.get_json(silent=True))

    updates: Dict[str, Any] = {}
    if "local_only" in data:
        updates["local_only"] = 1 if validation.boolean(data, "local_only") else 0
    if "motion" in data:
        updates["motion"] = validation.choice(
            data, "motion", settings.MOTION_CHOICES, default="liquid"
        )
    if "sidebar_collapsed" in data:
        updates["sidebar_collapsed"] = validation.integer(
            data, "sidebar_collapsed", default=0, minimum=0, maximum=1
        )
    if "tools_collapsed" in data:
        updates["tools_collapsed"] = validation.integer(
            data, "tools_collapsed", default=0, minimum=0, maximum=1
        )
    if "display_name" in data:
        updates["display_name"] = validation.text(
            data, "display_name", max_len=60, label="Display name"
        )
    if "timezone" in data:
        updates["timezone"] = validation.text(
            data, "timezone", max_len=64, label="Timezone"
        ) or "UTC"
    if "provider_ai" in data:
        updates["provider_ai"] = validation.choice(
            data, "provider_ai", settings.AI_PROVIDER_CHOICES, default="none"
        )
    if "provider_search" in data:
        updates["provider_search"] = validation.choice(
            data, "provider_search", settings.SEARCH_PROVIDER_CHOICES, default="none"
        )

    # Keys are write-only: an empty string leaves the stored key untouched,
    # and the client never receives a key back.
    for field, key_name in (
        ("key_gemini", "key_gemini"),
        ("key_groq", "key_groq"),
        ("key_openrouter", "key_openrouter"),
        ("key_brave", "key_brave"),
        ("key_tavily", "key_tavily"),
    ):
        if field in data:
            value = validation.text(data, field, max_len=400, label="API key")
            if value:
                updates[key_name] = value
        if f"clear_{field}" in data and data[f"clear_{field}"]:
            updates[key_name] = ""

    settings.set_many(updates)
    return ok(
        settings=settings.public_settings(),
        providers=providers.status(),
        message="Settings saved.",
    )


@bp.get("/providers")
def provider_status():
    return ok(providers=providers.status())


@bp.get("/activity")
def get_activity():
    try:
        limit = int(request.args.get("limit", 8))
    except (TypeError, ValueError):
        limit = 8
    limit = max(1, min(limit, 50))
    return ok(activity=activity.recent(limit), counts=activity.counts())


@bp.post("/activity/clear")
def clear_activity():
    activity.clear()
    return ok(message="Activity history cleared.")


@bp.get("/backup")
def download_backup():
    include_secrets = request.args.get("secrets") in ("1", "true")
    blob, filename = backup.export_bytes(include_secrets=include_secrets)
    return Response(
        blob,
        mimetype="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Opspine-Secrets-Included": "yes" if include_secrets else "no",
        },
    )


@bp.post("/backup/inspect")
def inspect_backup():
    """Validate an uploaded backup and report what it contains."""
    payload = _uploaded_json()
    summary = backup.validate(payload)
    return ok(summary=summary)


@bp.post("/backup/restore")
def restore_backup():
    payload = _uploaded_json()
    replace = request.args.get("mode", "replace") == "replace"
    restored = backup.import_payload(payload, replace=replace)
    return ok(restored=restored, message="Backup restored.")


def _uploaded_json() -> Any:
    upload = request.files.get("file")
    if upload is not None:
        raw = upload.read()
        if len(raw) > 25 * 1024 * 1024:
            raise ApiError("That backup file is larger than 25 MB.", 413)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError("That file is not readable JSON.", 400)
    body = request.get_json(silent=True)
    if body is None:
        raise ApiError("Upload a backup file or send JSON in the request body.", 400)
    return body


@bp.get("/health")
def health():
    info = db.db_health()
    return ok(
        status="healthy",
        data_path=info["path"],
        schema_version=info["user_version"],
        tables=len(info["tables"]),
    )


@bp.post("/danger/reset")
def reset_data():
    """Delete all user data. Requires an explicit confirmation string."""
    data = validation.payload(request.get_json(silent=True))
    confirmation = validation.text(data, "confirm", required=True, label="Confirmation")
    if confirmation != "DELETE":
        raise ApiError('Type DELETE exactly to confirm.', 400)

    # Remove generated files first so the database never points at a file that
    # is gone; then clear the tables child-first.
    for row in db.rows("SELECT filename FROM documents"):
        safety.delete(row["filename"])

    for table in (
        "messages", "conversations", "drafts", "events", "tasks", "boards",
        "research_results", "research_notes", "research_sessions", "documents",
        "activity",
    ):
        db.execute(f"DELETE FROM {table}")
    return ok(message="All local data has been deleted.")
