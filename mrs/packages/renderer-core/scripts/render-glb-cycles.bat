@echo off
REM render-glb-cycles.bat — Blender Cycles photoreal render of exported GLB
REM
REM Usage:
REM   render-glb-cycles.bat input.glb output.png [samples] [width] [height]
REM
REM Requires: Blender 3.0+ on PATH, or set BLENDER_PATH to blender.exe

setlocal
set GLB=%1
set OUT=%2
set SAMPLES=%3
set WIDTH=%4
set HEIGHT=%5

if "%GLB%"=="" set GLB=output\test\scene.glb
if "%OUT%"=="" set OUT=output\test\cycles.png
if "%SAMPLES%"=="" set SAMPLES=256
if "%WIDTH%"=="" set WIDTH=1024
if "%HEIGHT%"=="" set HEIGHT=1024

if not exist "%GLB%" (
    echo ERROR: GLB not found: %GLB%
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set PY=%SCRIPT_DIR%render-glb-cycles.py
if not exist "%PY%" (
    echo ERROR: Missing %PY%
    exit /b 1
)

set BLENDER_BIN=blender
if defined BLENDER_PATH set BLENDER_BIN=%BLENDER_PATH%

echo [Cycles] Rendering %GLB% -^> %OUT% (samples=%SAMPLES%, %WIDTH%x%HEIGHT%)
"%BLENDER_BIN%" -b -P "%PY%" -- "%GLB%" "%OUT%" %SAMPLES% %WIDTH% %HEIGHT%
exit /b %ERRORLEVEL%
