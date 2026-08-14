@echo off
rem Mandala SD-CPP + Whisper bridge launcher
rem Public endpoint :13305 (this bridge) -> images :13306 (sd-server) | STT :13312 (whisper-server) | everything else :13307 (LemonadeServer)
rem
rem Requires: python on PATH, and existing builds at %MRS_SD_BUILD% / %MRS_WHISPER_BUILD% (defaults below).

set SD_ROOT=C:\Users\My PC\dev\stable-diffusion.cpp
set SD_EXE=%SD_ROOT%\build-vulkan\bin\sd-server.exe
set SD_MODEL=C:\Users\My PC\.cache\huggingface\hub\models--Green-Sky--SD-Turbo-GGUF\snapshots\19a31586d02d64a73b4419bc193b3ecfaf38e1f0\sd_turbo-f16-q8_0.gguf
set WHISPER_ROOT=C:\Users\My PC\dev\whisper.cpp
set WHISPER_EXE=%WHISPER_ROOT%\build-vulkan\bin\whisper-server.exe
set WHISPER_MODEL=C:\Users\My PC\.cache\huggingface\hub\models--ggerganov--whisper.cpp\snapshots\5359861c739e955e79d9a303bcbc70fb988958b1\ggml-tiny.bin
set BRIDGE=%~dp0bridge.py
set LEMONADE_SERVER=C:\Users\My PC\AppData\Local\lemonade_server\bin\LemonadeServer.exe
set LOGS=C:\Users\MYPC~1\AppData\Local\Temp\opencode
set SD_LOGS=%LOGS%

echo [1/4] Starting LemonadeServer on :13307 ...
start "lemonade-13307" /min "%LEMONADE_SERVER%"

echo [2/4] Starting sd-server on :13306 (SD-Turbo, 4 steps, cfg 1.0, vae-tiling) ...
start "sd-server-13306" /min cmd /c ""%SD_EXE%" --listen-ip 127.0.0.1 --listen-port 13306 --model "%SD_MODEL%" --vae-tiling --steps 4 --cfg-scale 1.0 --sampling-method euler >> "%LOGS%\sd13306.log" 2>&1"

echo [3/4] Starting whisper-server on :13312 (Whisper-Tiny, Vulkan) ...
start "whisper-server-13312" /min cmd /c ""%WHISPER_EXE%" -m "%WHISPER_MODEL%" --port 13312 --host 127.0.0.1 -dev 0 >> "%LOGS%\whisper13312.log" 2>&1"

timeout /t 45 /nobreak >nul

echo [4/4] Starting bridge on :13305 ...
python "%BRIDGE%"
