"""OPSpine application factory.

Separation of concerns:

* ``opspine/pages.py``      — server-rendered workspace pages (no data access)
* ``opspine/api/*``         — JSON blueprints (validation + HTTP only)
* ``opspine/services/*``    — business logic and storage
* ``opspine/db.py``         — SQLite access and schema
"""
from __future__ import annotations

import logging
import os
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, jsonify, request


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    app.config.update(
        MAX_CONTENT_LENGTH=50 * 1024 * 1024,
        JSON_SORT_KEYS=False,
        SECRET_KEY=os.environ.get("OPSPINE_SECRET_KEY", os.urandom(24).hex()),
        SEND_FILE_MAX_AGE_DEFAULT=0,
        # Templates and static files are read from disk on every request so a
        # local edit is visible on reload without restarting the server.
        TEMPLATES_AUTO_RELOAD=True,
    )
    if config:
        app.config.update(config)

    _configure_logging(app)

    from .db import init_db

    init_db()

    from . import pages
    from .api import abyss_api, core_api, workspace_api
    from .api.responses import register_error_handlers

    app.register_blueprint(pages.bp)
    app.register_blueprint(core_api.bp)
    app.register_blueprint(abyss_api.bp)
    for blueprint in workspace_api.BLUEPRINTS:
        app.register_blueprint(blueprint)

    register_error_handlers(app)
    _register_template_helpers(app)

    @app.after_request
    def add_headers(response):
        # Local-first app: never cache HTML or API responses.
        if not request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store, must-revalidate"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "That endpoint does not exist."}), 404
        from flask import render_template

        return render_template("error.html", code=404,
                               message="That page does not exist."), 404

    @app.errorhandler(500)
    def server_error(error):
        app.logger.exception("Unhandled error on %s: %s", request.path, error)
        if request.path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "OPSpine hit an unexpected error. See the server log.",
            }), 500
        from flask import render_template

        return render_template(
            "error.html", code=500,
            message="OPSpine hit an unexpected error. See the server log.",
        ), 500

    return app


def _register_template_helpers(app: Flask) -> None:
    from .services import settings as settings_service

    @app.context_processor
    def inject_globals():
        return {
            "app_version": "1.0.0",
            "boot_time": time.time(),
            "local_only": settings_service.local_only(),
        }

    @app.template_filter("relative_time")
    def relative_time(value):
        """Human formatting for timestamps, used across workspaces."""
        if not value:
            return ""
        try:
            seconds = time.time() - float(value)
        except (TypeError, ValueError):
            return ""
        if seconds < 60:
            return "just now"
        if seconds < 3600:
            minutes = int(seconds // 60)
            return f"{minutes} min ago"
        if seconds < 86_400:
            hours = int(seconds // 3600)
            return f"{hours} hr ago" if hours > 1 else "1 hr ago"
        if seconds < 604_800:
            days = int(seconds // 86_400)
            return f"{days} days ago" if days > 1 else "yesterday"
        return time.strftime("%d %b %Y", time.localtime(float(value)))

    @app.template_filter("clock")
    def clock(value):
        if not value:
            return ""
        return time.strftime("%H:%M", time.localtime(float(value)))

    @app.template_filter("filesize")
    def filesize(value):
        try:
            size = float(value)
        except (TypeError, ValueError):
            return "—"
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} GB"


def _configure_logging(app: Flask) -> None:
    """Log to stderr and a rotating file, without ever logging secrets."""
    level = getattr(logging, os.environ.get("OPSPINE_LOG_LEVEL", "INFO").upper(), logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S"
    )

    stream = logging.StreamHandler()
    stream.setFormatter(formatter)
    app.logger.addHandler(stream)
    app.logger.setLevel(level)

    try:
        from .db import DATA_DIR

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            DATA_DIR / "opspine.log", maxBytes=1_000_000, backupCount=2
        )
        file_handler.setFormatter(formatter)
        app.logger.addHandler(file_handler)
    except OSError:  # a read-only install should still run
        app.logger.warning("Could not open the log file; logging to stderr only.")

    app.logger.propagate = False
