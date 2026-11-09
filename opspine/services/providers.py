"""Outbound provider gateway.

This is the only module in OPSpine that makes external HTTP requests, and the
local-only check lives *inside* the request path. Turning local-only on in the
UI therefore cannot be bypassed by calling an API route directly.

Every call has an explicit timeout and raises :class:`ProviderError` with a
message the UI can show. Nothing here invents model output: if no provider is
available the caller is told so and must present that honestly.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

import requests

from . import settings

REQUEST_TIMEOUT = (5, 45)  # (connect, read) seconds
MAX_SNIPPET = 600


class ProviderError(Exception):
    """An outbound provider problem with a user-presentable message."""

    def __init__(self, message: str, *, kind: str = "error", status: int = 502):
        super().__init__(message)
        self.message = message
        self.kind = kind  # disabled | unconfigured | timeout | network | upstream
        self.status = status


class LocalOnlyError(ProviderError):
    def __init__(self) -> None:
        super().__init__(
            "Local-only mode is on, so OPSpine blocked the outbound request. "
            "Turn off local-only in Settings to use an external provider.",
            kind="disabled",
            status=409,
        )


def _guard() -> None:
    """Called immediately before any socket is opened."""
    if settings.local_only():
        raise LocalOnlyError()


def _post(url: str, *, headers: Dict[str, str], body: Dict[str, Any]) -> Dict[str, Any]:
    _guard()
    try:
        response = requests.post(
            url, headers=headers, json=body, timeout=REQUEST_TIMEOUT
        )
    except requests.Timeout as exc:
        raise ProviderError(
            "The provider did not respond in time. Try again or pick another provider.",
            kind="timeout",
        ) from exc
    except requests.RequestException as exc:
        raise ProviderError(
            f"Could not reach the provider ({exc.__class__.__name__}).",
            kind="network",
        ) from exc
    return _read(response)


def _get(url: str, *, headers: Dict[str, str], params: Dict[str, Any]) -> Dict[str, Any]:
    _guard()
    try:
        response = requests.get(
            url, headers=headers, params=params, timeout=REQUEST_TIMEOUT
        )
    except requests.Timeout as exc:
        raise ProviderError(
            "The provider did not respond in time. Try again or pick another provider.",
            kind="timeout",
        ) from exc
    except requests.RequestException as exc:
        raise ProviderError(
            f"Could not reach the provider ({exc.__class__.__name__}).",
            kind="network",
        ) from exc
    return _read(response)


def _read(response: "requests.Response") -> Dict[str, Any]:
    if response.status_code >= 400:
        detail = ""
        try:
            payload = response.json()
            detail = (
                payload.get("error", {}).get("message")
                if isinstance(payload.get("error"), dict)
                else payload.get("message") or payload.get("error") or ""
            )
        except (ValueError, AttributeError):
            detail = (response.text or "")[:180]
        raise ProviderError(
            f"The provider returned HTTP {response.status_code}"
            + (f": {detail}" if detail else "."),
            kind="upstream",
            status=502,
        )
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderError(
            "The provider returned a response OPSpine could not read.",
            kind="upstream",
        ) from exc


# --------------------------------------------------------------------------- #
# AI providers
# --------------------------------------------------------------------------- #
def ai_available() -> bool:
    return settings.active_ai_provider() != "none"


def complete(prompt: str, *, system: str = "") -> Dict[str, Any]:
    """Send one prompt to the configured AI provider.

    Returns ``{"text", "provider", "model"}``. Raises :class:`ProviderError`
    whenever the answer is not genuinely from a provider.
    """
    provider = settings.active_ai_provider()
    if provider == "none":
        if settings.local_only():
            raise LocalOnlyError()
        raise ProviderError(
            "No AI provider is configured. Add a provider and key in Settings, "
            "or use one of the local tools.",
            kind="unconfigured",
            status=409,
        )

    key = settings.key_for(provider)
    started = time.time()
    if provider == "gemini":
        model = "gemini-2.0-flash"
        body: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.6, "maxOutputTokens": 1200},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        data = _post(
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent",
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            body=body,
        )
        text = "".join(
            part.get("text", "")
            for part in data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        ).strip()
    elif provider == "groq":
        model = "llama-3.3-70b-versatile"
        messages: List[Dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        data = _post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            body={"model": model, "messages": messages, "temperature": 0.6},
        )
        text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    elif provider == "openrouter":
        model = "openai/gpt-4o-mini"
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        data = _post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "X-Title": "OPSpine",
            },
            body={"model": model, "messages": messages},
        )
        text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    else:  # pragma: no cover - guarded by settings validation
        raise ProviderError(f"Unknown provider: {provider}", kind="unconfigured")

    if not text:
        raise ProviderError(
            "The provider returned an empty response. Nothing has been saved.",
            kind="upstream",
        )
    return {
        "text": text,
        "provider": provider,
        "model": model,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


# --------------------------------------------------------------------------- #
# Search providers
# --------------------------------------------------------------------------- #
def search_available() -> bool:
    return settings.active_search_provider() != "none"


def search(query: str, *, count: int = 8) -> Dict[str, Any]:
    """Run a live web search. Results are always attributed to the provider."""
    provider = settings.active_search_provider()
    if provider == "none":
        if settings.local_only():
            raise LocalOnlyError()
        raise ProviderError(
            "No research provider is configured. Add a Brave or Tavily key in "
            "Settings to run live web research. You can still keep local notes.",
            kind="unconfigured",
            status=409,
        )

    key = settings.key_for(provider)
    results: List[Dict[str, str]] = []

    if provider == "brave":
        data = _get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={"Accept": "application/json", "X-Subscription-Token": key},
            params={"q": query, "count": min(max(count, 1), 20)},
        )
        for item in data.get("web", {}).get("results", []):
            results.append(
                {
                    "title": (item.get("title") or "").strip()[:300],
                    "url": (item.get("url") or "").strip(),
                    "snippet": (item.get("description") or "").strip()[:MAX_SNIPPET],
                    "provider": "brave",
                }
            )
    elif provider == "tavily":
        data = _post(
            "https://api.tavily.com/search",
            headers={"Content-Type": "application/json"},
            body={
                "api_key": key,
                "query": query,
                "max_results": min(max(count, 1), 20),
                "search_depth": "basic",
            },
        )
        for item in data.get("results", []):
            results.append(
                {
                    "title": (item.get("title") or "").strip()[:300],
                    "url": (item.get("url") or "").strip(),
                    "snippet": (item.get("content") or "").strip()[:MAX_SNIPPET],
                    "provider": "tavily",
                }
            )
    else:  # pragma: no cover
        raise ProviderError(f"Unknown provider: {provider}", kind="unconfigured")

    results = [r for r in results if r["url"]]
    return {"provider": provider, "query": query, "results": results}


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
def status() -> Dict[str, Any]:
    """Honest description of what the gateway would do right now."""
    local = settings.local_only()
    ai = settings.active_ai_provider()
    srch = settings.active_search_provider()
    return {
        "local_only": local,
        "ai_provider": ai,
        "search_provider": srch,
        "ai_available": ai != "none",
        "search_available": srch != "none",
        "configured_ai": settings.get("provider_ai", "none"),
        "configured_search": settings.get("provider_search", "none"),
        "note": (
            "Local-only mode is on. All outbound requests are blocked on the server."
            if local
            else "Local-only mode is off. Only configured providers will be contacted."
        ),
    }
