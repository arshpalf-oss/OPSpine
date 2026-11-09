"""JSON response conventions.

Every API route returns ``{"ok": true, ...}`` or ``{"ok": false, "error": ...}``
with a meaningful status code, so the browser never has to guess what happened.
"""
from __future__ import annotations

from typing import Any, Dict

from flask import jsonify

from ..validation import ValidationError
from ..services.providers import ProviderError
from ..services.backup import BackupError
from ..services.documents import DocumentError
from ..services.localtext import ToolError


class ApiError(Exception):
    """An error with an HTTP status code and a message we are willing to show."""

    def __init__(self, message: str, status: int = 400, *, field: str = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


def ok(**payload: Any) -> Any:
    body: Dict[str, Any] = {"ok": True}
    body.update(payload)
    return jsonify(body)


def fail(message: str, status: int = 400, *, field: str = None, **extra: Any) -> Any:
    body: Dict[str, Any] = {"ok": False, "error": message}
    if field:
        body["field"] = field
    body.update(extra)
    return jsonify(body), status


def register_error_handlers(app) -> None:
    """Translate domain exceptions into consistent JSON."""

    @app.errorhandler(ValidationError)
    def _validation(err: ValidationError):
        return fail(err.message, 400, field=err.field)

    @app.errorhandler(ApiError)
    def _api(err: ApiError):
        return fail(err.message, err.status, field=err.field)

    @app.errorhandler(BackupError)
    def _backup(err: BackupError):
        return fail(str(err), 400, kind="backup")

    @app.errorhandler(DocumentError)
    def _document(err: DocumentError):
        return fail(str(err), 400, kind="document")

    @app.errorhandler(ToolError)
    def _localtext(err: ToolError):
        return fail(str(err), 400, kind="local_tool")

    @app.errorhandler(ProviderError)
    def _provider(err: ProviderError):
        # 409 for "not allowed / not configured", 502/504 for real transport faults.
        return fail(err.message, err.status, kind=err.kind)

    @app.errorhandler(404)
    def _not_found(_err):
        return fail("That resource does not exist.", 404)

    @app.errorhandler(405)
    def _bad_method(_err):
        return fail("That method is not allowed on this endpoint.", 405)

    @app.errorhandler(413)
    def _too_large(_err):
        return fail("That request is too large.", 413)

    @app.errorhandler(500)
    def _server(err):
        app.logger.exception("Unhandled server error: %s", err)
        return fail(
            "OPSpine hit an unexpected error. Check the server log for details.",
            500,
        )
