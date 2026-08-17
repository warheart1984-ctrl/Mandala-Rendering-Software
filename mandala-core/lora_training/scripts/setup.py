#!/usr/bin/env python3
"""
Setup script for Sovereign LoRA Training Pipeline
Creates directories, validates dependencies, prepares data
"""

import os
import sys
import subprocess
from pathlib import Path


def check_python_version():
    if sys.version_info < (3, 9):
        print("Error: Python 3.9+ required")
        sys.exit(1)
    print(f"Python {sys.version_info.major}.{sys.version_info.minor} OK")


def check_cuda():
    try:
        import torch
        if torch.cuda.is_available():
            print(f"CUDA available: {torch.cuda.get_device_name(0)}")
            print(f"CUDA version: {torch.version.cuda}")
            return True
        else:
            print("CUDA not available - using CPU (slow)")
            return False
    except ImportError:
        print("PyTorch not installed")
        return False


def install_requirements():
    print("Installing requirements...")
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
    ])


def create_directories():
    dirs = [
        "data/processed",
        "data/test",
        "checkpoints",
        "outputs",
        "logs"
    ]
    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)
        print(f"Created: {d}")


def validate_data():
    data_files = [
        "../docs/shader_ideas.md",
        "../docs/texture_ideas.md"
    ]

    all_exist = True
    for f in data_files:
        path = Path(f)
        if path.exists():
            print(f"Found: {f}")
        else:
            print(f"Missing: {f}")
            all_exist = False

    return all_exist


def main():
    print("=" * 50)
    print("Sovereign LoRA Training Pipeline Setup")
    print("=" * 50)

    check_python_version()
    check_cuda()

    create_directories()

    if validate_data():
        print("\nData files found. Running data preparation...")
        subprocess.run([sys.executable, "data/prepare_shader_library.py"])
        subprocess.run([sys.executable, "data/prepare_texture_library.py"])
        subprocess.run([sys.executable, "data/caption_generator.py"])
    else:
        print("\nPlease ensure shader_ideas.md and texture_ideas.md exist")

    print("\nSetup complete!")
    print("\nNext steps:")
    print("1. pip install -r requirements.txt")
    print("2. python train/train_sd_turbo_lora.py --config configs/sd_turbo_lora.yaml")
    print("3. python train/train_anythingv3_lora.py --config configs/anythingv3_lora.yaml")
    print("4. python train/train_vision_qc.py --config configs/vision_qc.yaml")


if __name__ == "__main__":
    main()
