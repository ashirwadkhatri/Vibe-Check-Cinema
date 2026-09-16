@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo Vibecheck Cinema Cache Service - Windows launcher
echo ==================================================

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3.11+ from python.org, then run this file again.
  pause
  exit /b 1
)

if not exist .env (
  echo.
  echo Warning: .env was not found.
  echo Copy .env.example to .env and fill in DATABASE_URL, TMDB_API_KEY, YOUTUBE_API_KEY.
  echo.
)

if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)

call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Starting the cache service on http://localhost:8000
echo Keep this window open while using the website.
echo.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
