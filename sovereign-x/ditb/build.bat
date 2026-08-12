@echo off
REM Build script for DITB (Dynamic Instruction Translation Bridge)
REM Run from: sovereign-x\ditb\

echo ============================================
echo Building DITB (Dynamic Instruction Translation Bridge)
echo ============================================

echo.
echo [1/4] Building DITB.exe (launcher)...
cl /EHsc /Ox /W3 /Fe:ditb.exe ditb.exe.cpp /link user32.lib kernel32.lib
if errorlevel 1 (
    echo ERROR: Failed to build DITB.exe
    exit /b 1
)

echo.
echo [2/4] Building ditb.dll (translation bridge)...
cl /LD /EHsc /Ox /W3 /Fe:ditb.dll dll\ditb.cpp /link user32.lib kernel32.lib
if errorlevel 1 (
    echo ERROR: Failed to build ditb.dll
    exit /b 1
)

echo.
echo [3/4] Building test AVX2 binary...
cl /arch:AVX2 /EHsc /Fe:test_avx2.exe test_avx2.cpp
if errorlevel 1 (
    echo ERROR: Failed to build test_avx2.exe
    exit /b 1
)

echo.
echo [4/4] Copying DLL to working directory...
copy /Y ditb.dll . >nul
if errorlevel 1 (
    echo WARNING: Could not copy ditb.dll
)

echo.
echo ============================================
echo Build complete! Files created:
echo   ditb.exe       - Launcher
echo   ditb.dll       - Translation bridge
echo   test_avx2.exe  - Test AVX2 binary
echo ============================================
echo.
echo To test on FX-8350:
echo   DITB.exe test_avx2.exe
echo.
echo Expected output:
echo   VPADDQ result: 3 3 3 3 3 3 3 3
echo   VPAND result: 0xF 0xF 0xF 0xF 0xF 0xF 0xF 0xF
echo   VPSRLDQ result: 8 8 8 8 8 8 8 8
echo.