"""Input validation for API boundaries.

Every write endpoint takes a JSON object and validates it through a small
declarative helper. Validation failures raise :class:`ValidationError`, which
the API error handler turns into a ``400`` JSON response naming the field.
Nothing here touches the database.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, Optional

MAX_TEXT = 20_000
MAX_LONG_TEXT = 200_000

_HEX_COLOUR = re.compile(r"^#[0-9a-fA-F]{6}$")
_URL_SAFE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


class ValidationError(Exception):
    """Raised when a request payload is not acceptable."""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.field = field


def payload(raw: Any) -> Dict[str, Any]:
    """Require a JSON object body."""
    if raw is None:
        raise ValidationError("A JSON body is required.")
    if not isinstance(raw, dict):
        raise ValidationError("The request body must be a JSON object.")
    return raw


def text(
    data: Dict[str, Any],
    field: str,
    *,
    required: bool = False,
    default: str = "",
    min_len: int = 0,
    max_len: int = MAX_TEXT,
    label: Optional[str] = None,
) -> str:
    """Read a string field, trimming surrounding whitespace."""
    label = label or field.replace("_", " ").capitalize()
    value = data.get(field, default)

    if value is None:
        value = default
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be text.", field)

    value = value.strip()
    if required and len(value) < max(1, min_len):
        raise ValidationError(f"{label} is required.", field)
    if len(value) > max_len:
        raise ValidationError(
            f"{label} must be {max_len:,} characters or fewer.", field
        )
    return value


def integer(
    data: Dict[str, Any],
    field: str,
    *,
    required: bool = False,
    default: Optional[int] = None,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
    label: Optional[str] = None,
) -> Optional[int]:
    label = label or field.replace("_", " ").capitalize()
    if field not in data or data.get(field) in (None, ""):
        if required:
            raise ValidationError(f"{label} is required.", field)
        return default

    value = data[field]
    if isinstance(value, bool):
        raise ValidationError(f"{label} must be a whole number.", field)
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if not isinstance(value, int):
        raise ValidationError(f"{label} must be a whole number.", field)
    if minimum is not None and value < minimum:
        raise ValidationError(f"{label} must be at least {minimum}.", field)
    if maximum is not None and value > maximum:
        raise ValidationError(f"{label} must be at most {maximum}.", field)
    return value


def number(value: Any, field: str, *, minimum: float = -1e9, maximum: float = 1e9) -> float:
    label = field.replace("_", " ").capitalize()
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"{label} must be a number.", field)
    value = float(value)
    if value != value:  # NaN
        raise ValidationError(f"{label} must be a number.", field)
    if not minimum <= value <= maximum:
        raise ValidationError(
            f"{label} must be between {minimum:g} and {maximum:g}.", field
        )
    return value


def boolean(data: Dict[str, Any], field: str, *, default: bool = False) -> bool:
    value = data.get(field, default)
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    raise ValidationError(
        f"{field.replace('_', ' ').capitalize()} must be true or false.", field
    )


def choice(
    data: Dict[str, Any],
    field: str,
    allowed: Iterable[str],
    *,
    default: Optional[str] = None,
) -> str:
    allowed = list(allowed)
    value = data.get(field, default)
    label = field.replace("_", " ").capitalize()
    if value is None:
        raise ValidationError(f"{label} is required.", field)
    if not isinstance(value, str) or value not in allowed:
        raise ValidationError(
            f"{label} must be one of: {', '.join(allowed)}.", field
        )
    return value


def identifier(data: Dict[str, Any], field: str = "id") -> int:
    value = integer(data, field, required=True, minimum=1, label="Id")
    assert value is not None
    return value


def url(data: Dict[str, Any], field: str, *, required: bool = False) -> str:
    value = text(data, field, required=required, max_len=2000, label="URL")
    if value and not _URL_SAFE.match(value):
        raise ValidationError("URL must start with http:// or https://.", field)
    return value


def colour(value: Any, *, default: str = "#7b9cff") -> str:
    if value in (None, ""):
        return default
    if not isinstance(value, str) or not _HEX_COLOUR.match(value):
        raise ValidationError("Colour must be a hex value such as #7b9cff.", "color")
    return value
