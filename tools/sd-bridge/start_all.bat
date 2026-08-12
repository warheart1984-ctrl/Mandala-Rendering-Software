@echo off
rem Mandala SD-CPP bridge launcher
rem Public endpoint :13305 (this bridge) -> images :13306 (sd-server) | everything else :13307 (LemonadeServer)
rem
rem Requires: python on PATH, and an existing build at %MRS_SD_BUILD% (default below).

set SD_ROOT=C:\Users\My PC\dev\stable-diffusion.cpp
set SD_EXE=%SD_ROOT%\build-vulkan\bin\sd-server.exe
set SD_MODEL=C:\Users\My PC\.cache\huggingface\hub\models--Green-Sky--SD-Turbo-GGUF\snapshots\19a31586d02d64a73b4419bc193b3ecfaf38e1f0\sd_turbo-f16-q8_0.gguf
set BRIDGE=G:\Mandala Rendering Software\tools\sd-bridge\bridge.py
set LEMONADE_SERVER=C:\Users\My PC\AppData\Local\lemonade_server\bin\LemonadeServer.exe
set LOGS=C:\Users\MYPC~1\AppData\Local\Temp\opencode

echo [1/3] Starting LemonadeServer on :13307 ...
start "lemonade-13307" /min "%LEMONADE_SERVER%"

echo [2/3] Starting sd-server on :13306 (SD-Turbo, 4 steps, cfg 1.0, vae-tiling) ...
start "sd-server-13306" /min cmd /c ""%SD_EXE%" --listen-ip 127.0.0.1 --listen-port 13306 --model "%SD_MODEL%" --vae-tiling --steps 4 --cfg-scale 1.0 --sampling-method euler >> "%LOGS%\sd13306.log" 2>&1"

timeout /t 45 /nobreak >nul

echo [3/3] Starting bridge on :13305 ...
python "%BRIDGE%"
