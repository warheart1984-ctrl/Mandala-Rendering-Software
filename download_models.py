#!/usr/bin/env python3
"""
Download model files for SME modules.
Run: python download_models.py
"""

import os
import sys
import shutil
from pathlib import Path

# Add huggingface_hub if needed
try:
    from huggingface_hub import hf_hub_download, snapshot_download
except ImportError:
    print("Installing huggingface_hub...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "huggingface_hub[hf_transfer]"], check=True)
    from huggingface_hub import hf_hub_download, snapshot_download

MODELS_DIR = Path(r"G:\Mandala Rendering Software\models")

def safe_print(msg):
    """Print with ASCII-safe characters"""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))

def download_tinyllama():
    """Download TinyLLaMA 1.1B GGUF model for llama.cpp"""
    safe_print("\n=== Downloading TinyLLaMA 1.1B GGUF ===")
    model_dir = MODELS_DIR / "tinyllama-1.1b"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # Try TheBloke's quantized version
    try:
        gguf_path = hf_hub_download(
            repo_id="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
            filename="tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            local_dir=model_dir,
            local_dir_use_symlinks=False,
        )
        safe_print(f"Downloaded TinyLLaMA GGUF: {gguf_path}")
        # Create symlink/copy with expected name
        target = model_dir / "ggml-model-q4_k_m.bin"
        if not target.exists():
            shutil.copy2(gguf_path, target)
            safe_print(f"Copied to expected name: {target}")
        return True
    except Exception as e:
        safe_print(f"Failed to download TinyLLaMA: {e}")
        return False

def download_mobilevit():
    """Download MobileViT XXS ONNX model"""
    safe_print("\n=== Downloading MobileViT XXS ONNX ===")
    model_dir = MODELS_DIR / "mobilevit-xxs"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        onnx_path = hf_hub_download(
            repo_id="apple/mobilevit-xxs",
            filename="mobilevit_xxs.onnx",
            local_dir=model_dir,
            local_dir_use_symlinks=False,
        )
        safe_print(f"Downloaded MobileViT XXS ONNX: {onnx_path}")
        return True
    except Exception as e:
        safe_print(f"Failed to download MobileViT XXS: {e}")
        return False

def download_whisper():
    """Download Whisper base GGML model"""
    safe_print("\n=== Downloading Whisper Base GGML ===")
    model_dir = MODELS_DIR / "whisper-base"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    ggml_path = model_dir / "ggml-base-q5_1.bin"
    if ggml_path.exists():
        safe_print(f"Whisper GGML already exists: {ggml_path}")
        return True
    
    try:
        # Try to download from ggerganov/whisper.cpp repo
        ggml_path = hf_hub_download(
            repo_id="ggerganov/whisper.cpp",
            filename="ggml-base-q5_1.bin",
            local_dir=MODELS_DIR / "whisper-base",
            local_dir_use_symlinks=False,
        )
        safe_print(f"Downloaded Whisper GGML: {ggml_path}")
        return True
    except Exception as e:
        safe_print(f"Failed to download Whisper GGML: {e}")
        return False

def download_video_model():
    """Create placeholder video model ONNX"""
    safe_print("\n=== Creating Video Model Placeholder ===")
    model_dir = MODELS_DIR / "video-uniform"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    onnx_path = model_dir / "video-uniform.onnx"
    if onnx_path.exists():
        safe_print(f"Video ONNX already exists: {onnx_path}")
        return True
    
    # Create a minimal placeholder
    with open(onnx_path, "wb") as f:
        f.write(b"placeholder")
    safe_print(f"Created placeholder video ONNX: {onnx_path}")
    return True

def main():
    safe_print("=" * 60)
    safe_print("Downloading SME Model Files")
    safe_print("=" * 60)
    
    # Download in order of priority
    results = {}
    results["tinyllama"] = download_tinyllama()
    results["mobilevit"] = download_mobilevit()
    results["whisper"] = download_whisper()
    results["video"] = download_video_model()
    
    safe_print("\n" + "=" * 60)
    safe_print("Download complete!")
    safe_print("=" * 60)
    
    # Verify downloads
    safe_print("\nVerifying downloads:")
    for model_dir in ["tinyllama-1.1b", "mobilevit-xxs", "whisper-base"]:
        dir_path = MODELS_DIR / model_dir
        files = list(dir_path.rglob("*"))
        for f in files:
            if f.is_file():
                size_mb = f.stat().st_size / (1024 * 1024)
                safe_print(f"  {f.relative_to(MODELS_DIR)}: {size_mb:.1f} MB")

if __name__ == "__main__":
    main()