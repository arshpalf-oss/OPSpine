"""Settings storage.

Settings live in one flat table. Reads return plain Python values; secrets are
never included in anything that is serialised to the browser — only a boolean
"configured" flag is published.

The local-only switch is stored here and read by
:mod:`opspine.services.providers` at the moment of an outbound call.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from ..db import DEFAULT_SETTINGS, SECRET_SETTING_KEYS, one, rows
from .. import db

BOOL_KEYS = {"local_only"}
INT_KEYS = {"sidebar_collapsed", "tools_collapsed"}
MOTION_CHOICES = ("liquid", "calm", "cinematic", "still")
AI_PROVIDER_CHOICES = ("none", "gemini", "groq", "openrouter")
SEARCH_PROVIDER_CHOICES = ("none", "brave", "tavily")


def _coerce(key: str, raw: Any) -> Any:
    if raw is None:
        return None
    if key in BOOL_KEYS:
        return str(raw) in ("1", "true", "True")
    if key in INT_KEYS:
        try:
            return int(str(raw))
        except (TypeError, ValueError):
            return 0
    return str(raw)


def get(key: str, default: Any = None) -> Any:
    row = one("SELECT value FROM settings WHERE key = ?", (key,))
    if row is None:
        return _coerce(key, DEFAULT_SETTINGS.get(key, default))
    return _coerce(key, row["value"])


def get_all() -> Dict[str, Any]:
    stored = {r["key"]: r["value"] for r in rows("SELECT key, value FROM settings")}
    merged: Dict[str, Any] = {}
    for key in DEFAULT_SETTINGS:
        merged[key] = _coerce(key, stored.get(key, DEFAULT_SETTINGS[key]))
    return merged


def set_value(key: str, value: Any) -> None:
    if isinstance(value, bool):
        value = "1" if value else "0"
    db.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
        "updated_at = excluded.updated_at",
        (key, "" if value is None else str(value), time.time()),
    )


def set_many(values: Dict[str, Any]) -> None:
    for key, value in values.items():
        set_value(key, value)


def local_only() -> bool:
    """The one function the network layer consults."""
    return bool(get("local_only", True))


def secret_configured() -> Dict[str, bool]:
    """Publish only whether a key exists — never the key itself."""
    state = {}
    for key in SECRET_SETTING_KEYS:
        state[key] = bool(get(key, ""))
    return state


def public_settings() -> Dict[str, Any]:
    """Everything the browser is allowed to know about configuration."""
    values = get_all()
    for key in SECRET_SETTING_KEYS:
        values.pop(key, None)
    values["secrets"] = secret_configured()
    values["ai_provider"] = get("provider_ai", "none")
    values["search_provider"] = get("provider_search", "none")
    values["active_ai"] = active_ai_provider()
    values["active_search"] = active_search_provider()
    return values


def key_for(provider: str) -> str:
    mapping = {
        "gemini": "key_gemini",
        "groq": "key_groq",
        "openrouter": "key_openrouter",
        "brave": "key_brave",
        "tavily": "key_tavily",
    }
    field = mapping.get(provider)
    return get(field, "") if field else ""


def active_ai_provider() -> str:
    """The AI provider that would actually be used right now, or 'none'."""
    if local_only():
        return "none"
    provider = get("provider_ai", "none")
    if provider in ("none", "", None):
        return "none"
    return provider if key_for(provider) else "none"


def active_search_provider() -> str:
    if local_only():
        return "none"
    provider = get("provider_search", "none")
    if provider in ("none", "", None):
        return "none"
    return provider if key_for(provider) else "none"
