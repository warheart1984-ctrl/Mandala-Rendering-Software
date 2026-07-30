@echo off
REM Start Jarvis Memory Board server (launched by scheduled task at logon)
set "ROOT=G:\Mandala Rendering Software\jarvis-memoryboard"
set "LOG=%ROOT%\data\jarvis.log"
set "PORT=8001"

REM Prefer hermes venv, then Drive-G runtime Python, then PATH
set "PYTHON="
if exist "%USERPROFILE%\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe" (
  set "PYTHON=%USERPROFILE%\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
) else if exist "G:\.runtime\python-3.13.14\python.exe" (
  set "PYTHON=G:\.runtime\python-3.13.14\python.exe"
) else (
  where python >nul 2>&1 && for /f "delims=" %%P in ('where python') do (
    if not defined PYTHON set "PYTHON=%%P"
  )
)

if not defined PYTHON (
  echo [%DATE% %TIME%] ERROR: no Python found >> "%LOG%"
  exit /b 1
)

echo [%DATE% %TIME%] Starting Jarvis Memory Board on port %PORT% with %PYTHON%... >> "%LOG%"
"%PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port %PORT% --log-level warning >> "%LOG%" 2>&1
echo [%DATE% %TIME%] Jarvis Memory Board exited with code %ERRORLEVEL% >> "%LOG%"
