@echo off
cd /d G:\Mandala Rendering Software\sovereign-x\axiom-native\build
cmake -G "Visual Studio 17 2022" -A x64 -DCMAKE_BUILD_TYPE=Release ..
if errorlevel 1 exit /b 1
cmake --build . --config Release
if errorlevel 1 exit /b 1
echo Build complete