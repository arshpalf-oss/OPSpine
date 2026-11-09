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
    return redirect(url_for("pages.workspace", key="dashboard"))


@bp.get("/<key>")
def workspace(key: str):
    found = get(key)
    if found is None:
        from flask import abort

        abort(404)
    return render_template(found["template"], **_shell_context(found))
