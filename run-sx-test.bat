@echo off
taskkill /F /IM node.exe 2>nul
start /B node mrs/mcp/server.js > sx-out.log 2> sx-err.log
timeout /t 3 /nobreak >nul
powershell -ExecutionPolicy Bypass -File test-sovereignx.ps1
type sx-out.log
type sx-err.log