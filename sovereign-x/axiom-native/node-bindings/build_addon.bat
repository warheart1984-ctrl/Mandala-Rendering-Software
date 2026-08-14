@echo off
rem Builds axiomx.node (node addon) directly with cl.exe, bypassing node-gyp's
rem MSBuild command-line generation. Requires: VS2022 BuildTools, node headers
rem (node-gyp Cache), nan in node_modules, and uals.dll already built via
rem ..\..\axiom-native\build_vs.bat.
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 exit /b 1

set NODE_INC=%LOCALAPPDATA%\node-gyp\Cache\24.18.0\include\node
set NODE_LIB=%LOCALAPPDATA%\node-gyp\Cache\24.18.0\x64\node.lib
if not exist "%NODE_INC%\node.h" (
  echo node headers not found at %NODE_INC% - run "npm install" first
  exit /b 1
)

if not exist "build\Release" mkdir "build\Release"
copy /y "..\..\axiom-native\build\uals.dll" "build\Release\" >nul

cl /nologo /W4 /O2 /MD /LD /EHsc /std:c++20 /Zc:__cplusplus ^
  /D BUILDING_NODE_EXTENSION /D NOMINMAX /D _CRT_SECURE_NO_WARNINGS ^
  /I "%NODE_INC%" /I "node_modules\nan" /I "..\..\axiom-native\include" ^
  "src\axiomx.cc" /link /OUT:"build\Release\axiomx.node" "%NODE_LIB%"
if errorlevel 1 exit /b 1

echo Build complete: build\Release\axiomx.node
endlocal