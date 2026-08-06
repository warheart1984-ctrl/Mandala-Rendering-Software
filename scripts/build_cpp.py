#!/usr/bin/env python3
"""
SME Suite C++ Build Script
Builds all C++ modules with CMake + Ninja + MSVC
"""
import subprocess
import sys
from pathlib import Path
import os


def run_cmd(cmd, cwd=None, env=None):
    """Run command and stream output"""
    print(f"Running: {cmd}")
    if isinstance(cmd, str):
        cmd = [cmd]
    result = subprocess.run(cmd, shell=False, cwd=cwd, env=env, 
                          capture_output=False, text=True)
    if result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
        return False
    return True


def check_dependencies():
    """Check required tools are available"""
    tools = {
        "cmake": "cmake --version",
        "ninja": "ninja --version",
        "cl": "cl /?",  # MSVC
        "ffmpeg": "ffmpeg -version",
    }
    
    missing = []
    for tool, cmd in tools.items():
        try:
            subprocess.run(cmd, shell=True, capture_output=True, check=True)
            print(f"[OK] {tool}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"[MISSING] {tool}")
            missing.append(tool)
    
    return len(missing) == 0


def setup_onnxruntime(build_dir: Path):
    """Download and extract ONNX Runtime if not present"""
    ort_dir = build_dir / "onnxruntime"
    if ort_dir.exists() and (ort_dir / "include" / "onnxruntime_cxx_api.h").exists():
        print("ONNX Runtime already present")
        return True
    
    # ONNX Runtime 1.18.0 Windows x64
    ort_version = "1.18.0"
    ort_url = f"https://github.com/microsoft/onnxruntime/releases/download/v{ort_version}/onnxruntime-win-x64-{ort_version}.zip"
    ort_zip = build_dir / f"onnxruntime-win-x64-{ort_version}.zip"
    
    print(f"Downloading ONNX Runtime {ort_version}...")
    import urllib.request
    urllib.request.urlretrieve(ort_url, ort_zip)
    
    import zipfile
    with zipfile.ZipFile(ort_zip, 'r') as z:
        z.extractall(build_dir)
    
    # Rename extracted folder
    extracted = build_dir / f"onnxruntime-win-x64-{ort_version}"
    if extracted.exists():
        if ort_dir.exists():
            import shutil
            shutil.rmtree(ort_dir)
        extracted.rename(ort_dir)
    
    ort_zip.unlink()
    print("ONNX Runtime installed")
    return True


def build_module(module_name: str, source_dir: Path, build_dir: Path):
    """Build a single CMake module"""
    module_build = build_dir / module_name
    module_build.mkdir(parents=True, exist_ok=True)
    
    # Use list form to handle spaces in paths
    cmake_cmd = [
        "cmake",
        "-G", "Ninja",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DCMAKE_CXX_STANDARD=17",
        str(source_dir)
    ]
    
    print(f"\n=== Configuring {module_name} ===")
    # Use list form to avoid shell splitting issues
    result = subprocess.run(cmake_cmd, cwd=module_build, capture_output=False, text=True)
    if result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
        return False
    
    print(f"=== Building {module_name} ===")
    result = subprocess.run(["ninja"], cwd=module_build, capture_output=False, text=True)
    if result.returncode != 0:
        print(f"ERROR: Build failed with exit code {result.returncode}")
        return False
    
    print(f"[OK] {module_name} built successfully")
    return True


def main():
    if not check_dependencies():
        print("\nMissing required dependencies. Please install missing tools.")
        sys.exit(1)
    
    root = Path(__file__).parent.parent  # Go up to repo root
    build_dir = root / "build"
    build_dir.mkdir(exist_ok=True)
    
    # Setup ONNX Runtime
    if not setup_onnxruntime(build_dir):
        print("Failed to setup ONNX Runtime")
        sys.exit(1)
    
    # Module source directories
    modules = {
        "sme_vis": "modules/sme-vis",
        "sme_aud": "modules/sme-aud",
        "sme_gen": "modules/sme-gen",
        # "sme_txt": "modules/sme-txt",  # Skip for now - API compatibility issues
    }
    
    print("\n=== Building SME C++ Modules ===")
    for name, rel_path in modules.items():
        source = root / rel_path
        if not source.exists():
            print(f"Warning: {source} not found, skipping")
            continue
        
        if not build_module(name, source, build_dir):
            print(f"Failed to build {name}")
            sys.exit(1)
    
    print("\n=== All modules built successfully! ===")
    print(f"Binaries in: {build_dir}")


if __name__ == "__main__":
    main()