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

# Install deps
echo "[opspine] Installing dependencies..."
pip install --quiet -r requirements.txt

# Create data dir
mkdir -p data

# Start
PORT="${PORT:-5000}"
echo "[opspine] Starting on http://localhost:${PORT}"
exec python app.py
