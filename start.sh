#!/usr/bin/env bash
# OPSpine start script
set -e
cd "$(dirname "$0")"

# Create venv if missing
if [ ! -d "venv" ]; then
  echo "[opspine] Creating virtual environment..."
  python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

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
