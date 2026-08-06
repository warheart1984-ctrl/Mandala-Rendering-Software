@echo off
cd /d "G:\Mandala Rendering Software\mrs"
python -c "import sys; sys.path.insert(0, r'G:\Mandala Rendering Software\mrs\apps\genblaze-media\app'); import genblaze_core; print('genblaze_core:', genblaze_core.__version__)"