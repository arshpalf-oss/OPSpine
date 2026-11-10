#!/usr/bin/env python3
"""Build the portable OPSpine archive.

    python3 build_zip.py            # writes dist/OPSpine.zip
    python3 build_zip.py --check    # build, then boot the archive in a temp dir

The archive is built from the files that are actually in the repository plus
an empty ``data/`` folder, so it can never contain a database, a log, a
virtualenv or generated documents. It is reproducible: the same tree produces
the same member list, and timestamps come from each file's mtime.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "dist" / "OPSpine.zip"
ARCHIVE_PREFIX = "OPSpine"

# Directories that never belong in a portable copy.
EXCLUDED_DIRS = {
    ".git", ".venv", "venv", "env", "__pycache__", "node_modules",
    "dist", "build", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "ref", "screenshots", ".idea", ".vscode",
}

# Files that are machine-specific state rather than part of the app.
EXCLUDED_SUFFIXES = (".pyc", ".pyo", ".db", ".db-wal", ".db-shm", ".log", ".zip")
EXCLUDED_NAMES = {".DS_Store", ".env"}

# Everything the archive must contain for a first run to work.
REQUIRED = [
    "app.py",
    "requirements.txt",
    "README.md",
    "start.sh",
    "start.bat",
    ".env.example",
    "opspine/__init__.py",
    "opspine/static/js/shell.js",
    "opspine/templates/base.html",
]


def included_files() -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(
            name for name in dirnames
            if name not in EXCLUDED_DIRS and not name.startswith(".venv")
        )
        for name in sorted(filenames):
            path = Path(dirpath) / name
            relative = path.relative_to(ROOT)
            if name in EXCLUDED_NAMES or name.endswith(EXCLUDED_SUFFIXES):
                continue
            # data/documents contents are user files; the folder itself is
            # created below so the app can write into it.
            if relative.parts[:1] == ("data",) and len(relative.parts) > 1:
                if relative != Path("data/documents/.gitkeep"):
                    continue
            files.append(relative)
    return files


def build() -> Path:
    files = included_files()
    missing = [item for item in REQUIRED if not (ROOT / item).is_file()]
    if missing:
        raise SystemExit(f"Refusing to build: missing {', '.join(missing)}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in files:
            source = ROOT / relative
            info = zipfile.ZipInfo.from_file(source, f"{ARCHIVE_PREFIX}/{relative.as_posix()}")
            info.compress_type = zipfile.ZIP_DEFLATED
            with source.open("rb") as handle:
                archive.writestr(info, handle.read())
        # Guarantee the writable folders exist even in a fresh checkout.
        for folder in ("data", "data/documents"):
            archive.writestr(f"{ARCHIVE_PREFIX}/{folder}/", b"")

    size = OUTPUT.stat().st_size
    print(f"{OUTPUT.relative_to(ROOT)}  {len(files)} files  {size / 1024:.0f} KB")
    return OUTPUT


def check(archive_path: Path) -> int:
    """Extract, then boot the extracted copy against a throwaway data dir."""
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(tmp)
        extracted = Path(tmp) / ARCHIVE_PREFIX
        env = dict(os.environ)
        env.update({
            "OPSPINE_DATA_DIR": str(Path(tmp) / "data-check"),
            "OPSPINE_PORT": "5111",
            "OPSPINE_HOST": "127.0.0.1",
        })
        print(f"booted from {extracted}")
        try:
            result = subprocess.run(
                [sys.executable, "-c",
                 "import app;"
                 "client = app.app.test_client();"
                 "paths = ['/', '/dashboard', '/abyss', '/scout', '/forge', '/quill',"
                 " '/kronos', '/whiteboard', '/dash', '/working-board', '/library',"
                 " '/settings', '/api/health'];"
                 "codes = {p: client.get(p).status_code for p in paths};"
                 "print(codes);"
                 "assert all(code == 200 for code in codes.values()), codes;"
                 "print('archive boots: all 13 routes 200')"],
                cwd=extracted, env=env, capture_output=True, text=True, timeout=180,
            )
        except subprocess.TimeoutExpired:
            print("archive boot timed out")
            return 1
        print(result.stdout.strip())
        if result.returncode != 0:
            print(result.stderr.strip()[-2000:])
            return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the portable OPSpine ZIP.")
    parser.add_argument("--check", action="store_true",
                        help="extract the archive and boot it before reporting success")
    args = parser.parse_args()

    archive_path = build()
    if args.check:
        return check(archive_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
