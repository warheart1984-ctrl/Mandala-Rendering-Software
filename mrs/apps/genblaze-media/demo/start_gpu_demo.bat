@echo off
REM Sovereign X Kernel -- GPU Demo Launcher
REM Uses local Lemonade server for GPU-accelerated rendering.
REM
REM Prerequisites:
REM   1. Lemonade Server running on localhost:13305
REM      (run "lemonade serve" in another terminal)
REM   2. SD-Turbo model pulled
REM      (run "lemonade pull SD-Turbo" if not already)
REM
REM Usage:
REM   demo\start_gpu_demo.bat
REM   Then open http://127.0.0.1:18080/ in browser
REM   Or run: python demo/sx_demo.py --url http://127.0.0.1:18080

cd /d "%~dp0.."

echo ============================================================
echo  SOVEREIGN X KERNEL -- GPU DEMO
echo ============================================================
echo.
echo  Backend: Lemonade (local GPU via localhost:13305)
echo  Model:   SD-Turbo
echo  Kernel:  SovereignXKernel v1.0 (full CIS pipeline)
echo.
echo  Server will start on http://127.0.0.1:18080
echo  Dashboard: demo\sx_dashboard.html
echo  CLI demo:  python demo/sx_demo.py --url http://127.0.0.1:18080
echo.
echo ============================================================
echo.

set GENBLAZE_IMAGE_BACKEND=lemonade
set SX_DEMO_MODE=0

uvicorn app.main:app --host 127.0.0.1 --port 18080 --log-level info
