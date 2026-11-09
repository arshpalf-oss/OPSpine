"""Filesystem safety for generated documents.

Two rules, enforced in one place:

1. Files are written with names this module chooses — never a client-supplied
   name. Names are slugged, length-limited, and suffixed with a random token.
2. Files are read only by a name already recorded in the database, and that
   name is re-verified against the allowed directory before the filesystem is
   touched. A path that resolves outside ``data/documents`` is refused.
"""
from __future__ import annotations

import os
import re
import secrets
from pathlib import Path
from typing import Optional

from .db import DOCUMENTS_DIR

ALLOWED_EXTENSIONS = {
    "png", "docx", "pptx", "xlsx", "pdf", "md", "txt", "csv",
}

_UNSAFE = re.compile(r"[^a-z0-9]+")


class UnsafePathError(Exception):
    """Raised when a resolved path would escape the storage directory."""


def storage_dir() -> Path:
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    return DOCUMENTS_DIR.resolve()


def slug(value: str, *, limit: int = 48) -> str:
    """Reduce arbitrary text to a short, filesystem-safe stem."""
    cleaned = _UNSAFE.sub("-", (value or "").lower()).strip("-")
    if not cleaned:
        cleaned = "document"
    if len(cleaned) > limit:
        cleaned = cleaned[:limit].rstrip("-") or "document"
    return cleaned


def build_filename(title: str, extension: str) -> str:
    """Compose a unique, safe filename for a newly generated document."""
    ext = (extension or "").lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsafePathError(f"Unsupported file extension: {ext or '(none)'}")
    return f"{slug(title)}-{secrets.token_hex(4)}.{ext}"


def resolve_existing(filename: str) -> Path:
    """Return the absolute path of an existing stored file, or raise.

    ``filename`` must be a bare name that exists in the database. Anything that
    is not a plain filename inside the storage directory is rejected.
    """
    if not filename:
        raise UnsafePathError("Missing filename.")
    # Reject anything that looks like a path before touching the disk.
    if os.sep in filename or (os.altsep and os.altsep in filename):
        raise UnsafePathError("Filename may not contain path separators.")
    if filename in (".", "..") or filename.startswith("."):
        raise UnsafePathError("Filename may not be hidden or relative.")

    root = storage_dir()
    candidate = (root / filename).resolve()

    # The decisive check: the resolved candidate must sit directly in root.
    if candidate.parent != root:
        raise UnsafePathError("Filename resolves outside the storage directory.")

    suffix = candidate.suffix.lower().lstrip(".")
    if suffix not in ALLOWED_EXTENSIONS:
        raise UnsafePathError(f"File type .{suffix} is not downloadable.")

    if not candidate.is_file():
        raise UnsafePathError("File is no longer present on disk.")

    return candidate


def locate(filename: str) -> Optional[Path]:
    """Like :func:`resolve_existing` but returns ``None`` instead of raising."""
    try:
        return resolve_existing(filename)
    except UnsafePathError:
        return None


def delete(filename: str) -> bool:
    """Remove a stored file if it is safe and present."""
    path = locate(filename)
    if path is None:
        return False
    try:
        path.unlink()
        return True
    except OSError:
        return False
