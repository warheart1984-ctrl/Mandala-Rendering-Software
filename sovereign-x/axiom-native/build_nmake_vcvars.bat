@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d "G:\Mandala Rendering Software\sovereign-x\axiom-native"
rmdir /s /q build 2>nul
mkdir build
cd build
cmake -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release ..
if errorlevel 1 exit /b 1
nmake
if errorlevel 1 exit /b 1
echo Build complete