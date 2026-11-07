@echo off
REM OPSpine start script for Windows
cd /d "%~dp0"

if not exist venv (
    echo [opspine] Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo [opspine] Installing dependencies...
pip install -r requirements.txt

if not exist data mkdir data

set PORT=%PORT%
if "%PORT%"=="" set PORT=5000

echo [opspine] Starting on http://localhost:%PORT%
python app.py
pause
