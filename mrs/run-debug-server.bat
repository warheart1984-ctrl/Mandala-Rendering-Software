@echo off
cd /d G:\Mandala Rendering Software\mrs
node --trace-uncaught --unhandled-rejections=strict mcp/server.js 2>&1
pause