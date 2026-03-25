@echo off
setlocal enabledelayedexpansion
title DIP - Digital Investigation Platform (Local)

echo.
echo ===========================================
echo   DIP - Digital Investigation Platform
echo   Local start (FastAPI + Vite)
echo ===========================================
echo.

cd /d "%~dp0"

REM Optional: Start Ollama if installed (for AI Analyst narrative replies)
echo [OK] Checking Ollama (optional)...
curl -s -o nul -w "%%{http_code}" --connect-timeout 2 -m 3 http://localhost:11434/api/tags 2>nul | findstr /r "[0-9][0-9][0-9]" >nul
if errorlevel 1 (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Ollama not found. AI narrative will be unavailable.
    ) else (
        echo [OK] Starting Ollama...
        start /B ollama serve >nul 2>&1
        timeout /t 3 /nobreak >nul
    )
) else (
    echo [OK] Ollama is already running
)

REM Install backend dependencies (safe to run multiple times; pip will skip already-satisfied)
echo [OK] Ensuring backend Python dependencies (backend\requirements.txt)...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install failed. Please activate your Python environment and re-run start.bat.
    pause
    exit /b 1
)

REM Database in project root (dynamic: works on any system when you move the project)
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT_URL=%PROJECT_ROOT:\=/%"
set "DIP_DB_URL=sqlite:///%PROJECT_ROOT_URL%dip.db"

REM Start backend in a separate window (all in one file; no run_backend.bat needed)
echo [OK] Starting FastAPI backend on http://127.0.0.1:8000 ...
start "DIP Backend - FastAPI" cmd /k "cd /d ""%PROJECT_ROOT%"" && set DIP_DB_URL=%DIP_DB_URL% && uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"

REM Ensure frontend deps and start Vite in this window
if not exist node_modules (
    echo [OK] Installing frontend dependencies (npm install)...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please install Node.js 18+ and re-run start.bat.
        pause
        exit /b 1
    )
)

echo [OK] Starting frontend on http://localhost:5173 ...
start http://localhost:5173
npm run dev
