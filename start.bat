@echo off
REM OPSpine start script for Windows
cd /d "%~dp0"

if not exist venv (
    echo [opspine] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 goto :nopython
)

call venv\Scripts\activate.bat

echo [opspine] Upgrading pip (needed for Python 3.14+ on Windows)...
python -m pip install --upgrade pip
if errorlevel 1 echo [opspine] Warning: pip upgrade failed, continuing...

echo [opspine] Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [opspine] ERROR: Dependency installation failed.
    echo.
    echo If you are on Python 3.14 and Pillow fails to build, try one of these:
    echo   1. Use Python 3.11 or 3.12 (recommended): https://www.python.org/downloads/
    echo   2. Install Microsoft Visual C++ Build Tools, then retry
    echo   3. Run: pip install --upgrade pip ^&^& pip install Pillow
    echo.
    echo OPSpine will still start — PNG generation falls back to a built-in writer.
    echo.
    pause
)

if not exist data mkdir data

set PORT=%PORT%
if "%PORT%"=="" set PORT=5000

echo [opspine] Starting on http://localhost:%PORT%
python app.py
if errorlevel 1 (
    echo.
    echo [opspine] Failed to start. Make sure Flask is installed:
    echo   venv\Scripts\activate
    echo   pip install Flask
    echo.
    pause
)
goto :eof

:nopython
echo [opspine] ERROR: Python not found. Install Python 3.9+ from https://www.python.org/
echo Make sure to check "Add Python to PATH" during installation.
pause
