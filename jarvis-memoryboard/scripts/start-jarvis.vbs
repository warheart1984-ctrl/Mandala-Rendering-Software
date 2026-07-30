' Start Jarvis Memory Board silently (no console window)
' Launched at user logon via Startup folder or Task Scheduler.

Dim shell, pythonExe, projectRoot, port, logFile
Set shell = CreateObject("WScript.Shell")

pythonExe = "C:\Users\My PC\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
projectRoot = "G:\Mandala Rendering Software\jarvis-memoryboard"
port = "8001"
logFile = projectRoot & "\data\jarvis.log"

' Start uvicorn hidden
shell.Run """" & pythonExe & """ -m uvicorn app.main:app --host 127.0.0.1 --port " & port & " --log-level warning", 0, False
