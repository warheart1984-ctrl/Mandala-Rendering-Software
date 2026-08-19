@echo off
REM Constitutional LoRA Training — DirectML (RX 580)
REM Memory-safe config: resolution=128, rank=8, grad_accum=4, max_steps=1000

set PIP_CACHE_DIR=E:\pip_cache
set XDG_CACHE_HOME=E:\.cache
set TMP=E:\tmp
set TEMP=E:\tmp

REM Use explicit venv python — NOT hermes/system python
set VENV_PYTHON=E:\Mandala-Bradley\.venv\Scripts\python.exe

echo ============================================
echo  Constitutional LoRA Training — DirectML
echo  Device: AMD RX 580 (gfx803)
echo  Config: resolution=128, rank=8, accum=4
echo ============================================

"%VENV_PYTHON%" "%~dp0train_directml.py"

echo.
echo Done. Check E:\Mandala-Rendering-Software\Anime Pictures for training\lora_out\sd_turbo_dml\
pause
