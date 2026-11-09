#!/usr/bin/env bash
# OPSpine start script
set -e
cd "$(dirname "$0")"

# Prefer an existing environment (venv/ or .venv/) so a fresh clone reuses
# whatever the user already set up.
if [ -d ".venv" ]; then
  VENV_DIR=".venv"
elif [ -d "venv" ]; then
  VENV_DIR="venv"
else
  echo "[opspine] Creating virtual environment in .venv ..."
  python3 -m venv .venv
  VENV_DIR=".venv"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# Upgrade pip for better wheel resolution (helps with Python 3.14+)
echo "[opspine] Upgrading pip..."
pip install --upgrade pip --quiet 2>/dev/null || true

# Install deps
echo "[opspine] Installing dependencies..."
if ! pip install -r requirements.txt 2>&1; then
  echo ""
  echo "[opspine] WARNING: Some dependencies failed to install."
  echo "The app will start but PNG generation uses a built-in fallback until Pillow is installed."
  echo "If Python 3.14 causes Pillow issues, try Python 3.11/3.12 or install system zlib headers."
  echo ""
fi

# Create data dir
mkdir -p data

# Start
PORT="${PORT:-5000}"
echo "[opspine] Starting on http://localhost:${PORT}"
exec python app.py
