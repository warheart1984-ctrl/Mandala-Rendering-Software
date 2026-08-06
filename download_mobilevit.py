#!/usr/bin/env python3
"""
Download MobileViT XXS ONNX model from alternative source
"""

import sys
from pathlib import Path

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "huggingface_hub[hf_transfer]"], check=True)
    from huggingface_hub import hf_hub_download

MODELS_DIR = Path(r"G:\Mandala Rendering Software\models")

def download_mobilevit():
    """Download MobileViT XXS ONNX model from alternative sources"""
    print("\n=== Downloading MobileViT XXS ONNX ===")
    model_dir = Path(r"G:\Mandala Rendering Software\models\mobilevit-xxs")
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # Try multiple sources
    sources = [
        ("dandelion/mobilevit-xxs-onnx", "mobilevit_xxs.onnx"),
        ("apple/coreml-mobilevit-xxs", "mobilevit_xxs.onnx"),
        ("timm/mobilevit_xxs.onnx", "mobilevit_xxs.onnx"),
    ]
    
    for repo_id, filename in sources:
        try:
            print(f"Trying {repo_id}/{filename}...")
            onnx_path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=r"G:\Mandala Rendering Software\models\mobilevit-xxs",
                local_dir_use_symlinks=False,
            )
            print(f"SUCCESS: Downloaded MobileViT XXS ONNX: {onnx_path}")
            return True
        except Exception as e:
            print(f"  Failed: {e}")
    
    # If all fail, try to convert from PyTorch
    print("\nTrying to export from PyTorch/timm...")
    try:
        import torch
        import timm
        
        print("Loading MobileViT XXS from timm...")
        model = timm.create_model('mobilevit_xxs', pretrained=True)
        model.eval()
        
        # Export to ONNX
        dummy_input = torch.randn(1, 3, 224, 224)
        onnx_path = Path(r"G:\Mandala Rendering Software\models\mobilevit-xxs\mobilevit_xxs.onnx")
        
        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}},
            opset_version=11
        )
        print(f"SUCCESS: Exported MobileViT XXS ONNX: {onnx_path}")
        return True
    except Exception as e:
        print(f"PyTorch export failed: {e}")
    
    return False

if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(r"G:\Mandala Rendering Software")))
    
    success = download_mobilevit()
    if success:
        print("\nMobileViT XXS ONNX downloaded successfully!")
    else:
        print("\nFailed to download MobileViT XXS ONNX from all sources")
        print("You may need to manually download from:")
        print("  - https://github.com/apple/ml-mobilevit")
        print("  - Convert from PyTorch using timm library")