import sys
import os
sys.path.insert(0, r'G:\Mandala Rendering Software\mrs\apps\genblaze-media\app')
try:
    import genblaze_core
    print('genblaze_core:', genblaze_core.__version__)
except ModuleNotFoundError as e:
    print('ModuleNotFoundError:', e)
    print('sys.path:', sys.path)