"""Server-rendered workspace pages.

Every workspace is a real URL that returns complete markup. The shared shell is
a Jinja layout; each workspace supplies its own body block, stylesheet and
script. Navigation uses ordinary links, so back/forward and page reload works
without client-side routing.
"""
from __future__ import annotations

from flask import Blueprint, redirect, render_template, url_for

from .services import activity, providers, settings
from .workspaces import WORKSPACES, get

bp = Blueprint("pages", __name__)


def _shell_context(workspace: dict) -> dict:
    return {
        "workspace": workspace,
        "workspaces": WORKSPACES,
        "settings": settings.public_settings(),
        "provider_status": providers.status(),
        "recent_activity": activity.recent(6),
        "counts": activity.counts(),
    }


@bp.get("/")
def index():
    """The launcher is the front door.

    When the user has pinned a workspace ("resume" launch mode) a bare `/`
    goes straight there, but `/dashboard` always shows the launcher so it is
    never more than one click away.
    """
    from flask import make_response

    values = settings.public_settings()
    pinned = values.get("last_workspace") or ""
    if values.get("launch_mode") == "resume" and pinned.startswith("/"):
        target = get(pinned.lstrip("/"))
        if target and target["key"] != "dashboard":
            return redirect(url_for("pages.workspace", key=target["key"]))

    # Otherwise render the launcher directly so `/` is not a redirect hop.
    found = get("dashboard")
    return make_response(render_template(found["template"], **_shell_context(found)), 200)


@bp.get("/<key>")
def workspace(key: str):
    found = get(key)
    if found is None:
        from flask import abort

        abort(404)
    if found["key"] != "dashboard":
        settings.set_value("last_workspace", found["path"])
    return render_template(found["template"], **_shell_context(found))
