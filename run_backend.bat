@echo off
cd /d "%~dp0"
REM Database in project root on any system (%~dp0 = folder where this batch lives)
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:\=/%"
set "DIP_DB_URL=sqlite:///%PROJECT_ROOT%dip.db"
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
pause
