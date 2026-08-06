@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
python "G:\Mandala Rendering Software\scripts\build_cpp.py"
pause