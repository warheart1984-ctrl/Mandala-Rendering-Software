@echo off
REM ── LoRA Training Background Launcher ──
REM Survives terminal close. Check logs to monitor progress.
REM Logs: E:\Mandala-Rendering-Software\lora_train.log

echo [%date% %time%] Starting LoRA training... > E:\Mandala-Rendering-Software\lora_train.log
echo [%date% %time%] Device: AMD RX 580 via DirectML >> E:\Mandala-Rendering-Software\lora_train.log
echo [%date% %time%] Model: SD Turbo (4.9GB) >> E:\Mandala-Rendering-Software\lora_train.log
echo [%date% %time%] Dataset: 111 images (63 anime + 48 procedural) >> E:\Mandala-Rendering-Software\lora_train.log
echo [%date% %time%] Output: E:\Mandala-Rendering-Software\Anime Pictures for training\lora_out\sd_turbo_dml >> E:\Mandala-Rendering-Software\lora_train.log
echo. >> E:\Mandala-Rendering-Software\lora_train.log

E:\tmp\kohya-venv\Scripts\python.exe -u E:\Mandala-Rendering-Software\mandala-core\lora_training\train\train_directml.py >> E:\Mandala-Rendering-Software\lora_train.log 2>&1

echo [%date% %time%] Training complete. >> E:\Mandala-Rendering-Software\lora_train.log
echo [%date% %time%] Exit code: %ERRORLEVEL% >> E:\Mandala-Rendering-Software\lora_train.log
