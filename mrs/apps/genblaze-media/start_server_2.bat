@echo off
cd /d "G:\Mandala Rendering Software\mrs\apps\genblaze-media"
set PYTHONPATH=G:\Mandala Rendering Software\mrs\apps\genblaze-media\app
start /b python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level debug