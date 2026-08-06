#!/usr/bin/env python3
"""
detect-gpu.py — Multi-backend GPU Detection for AMD ROCm, NVIDIA CUDA, and CPU.

Detects the available GPU backend using a 3-level approach:
  1. PyTorch (torch.cuda) — works for both ROCm and CUDA
  2. System commands — nvidia-smi (NVIDIA) or rocm-smi/rocminfo (AMD)
  3. CPU fallback — no GPU detected

Usage:
    python3 detect-gpu.py              # human-readable output
    python3 detect-gpu.py --json       # JSON output (for programmatic use)

Exit codes:
    0  — GPU detected (ROCm or CUDA)
    1  — CPU only (no GPU found)

Dependencies: Python 3.8+ stdlib; torch is optional (detection works without it).
"""

import json
import os
import re
import subprocess
import sys
from typing import Any, Dict


# ── Detection Logic ────────────────────────────────────────────────────

def detect_gpu_backend() -> Dict[str, Any]:
    """
    Detect the GPU backend available on the system.

    Returns:
        dict with keys:
          - available:      bool, True if any GPU is found
          - backend:        str,  "cuda" | "rocm" | "cpu"
          - device_count:   int,  number of GPUs
          - device_name:    str,  name of the first GPU
          - driver_version: str,  driver version
          - torch_cuda:     bool, torch.cuda.is_available()
          - torch_version:  str,  PyTorch version or "no instalado"
          - hip_version:    str,  torch.version.hip (ROCm only)
          - cuda_version:   str,  torch.version.cuda (NVIDIA only)
          - gfx_arch:       str,  GFX architecture from rocminfo (ROCm only)
    """
    result: Dict[str, Any] = {
        "available": False,
        "backend": "cpu",
        "device_count": 0,
        "device_name": "",
        "driver_version": "",
        "torch_cuda": False,
        "torch_version": "",
        "hip_version": "",
        "cuda_version": "",
        "gfx_arch": "",
    }

    # ────────────────────────────────────────────────────────────
    # Level 1: PyTorch detection (works for both ROCm and CUDA)
    # ────────────────────────────────────────────────────────────
    try:
        import torch

        result["torch_version"] = torch.__version__
        result["torch_cuda"] = torch.cuda.is_available()

        if torch.cuda.is_available():
            result["available"] = True
            result["device_count"] = torch.cuda.device_count()
            result["device_name"] = torch.cuda.get_device_name(0)

            # Distinguish ROCm from CUDA via torch.version
            hip_ver = getattr(torch.version, "hip", None)
            cuda_ver = getattr(torch.version, "cuda", None)

            if hip_ver:
                result["backend"] = "rocm"
                result["hip_version"] = hip_ver
            elif cuda_ver:
                result["backend"] = "cuda"
                result["cuda_version"] = cuda_ver
            else:
                result["backend"] = "cuda"

            return result
    except ImportError:
        result["torch_version"] = "no instalado"

    # ────────────────────────────────────────────────────────────
    # Level 2: System command detection
    # ────────────────────────────────────────────────────────────

    # Try nvidia-smi (NVIDIA)
    try:
        nv_out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if nv_out.returncode == 0 and nv_out.stdout.strip():
            lines = [l.strip() for l in nv_out.stdout.strip().split("\n") if l.strip()]
            result["available"] = True
            result["backend"] = "cuda"
            result["device_count"] = len(lines)
            first = [x.strip() for x in lines[0].split(",")]
            result["device_name"] = first[0]
            result["driver_version"] = first[1] if len(first) > 1 else ""
            return result
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try rocm-smi (AMD)
    try:
        rs_out = subprocess.run(
            ["rocm-smi", "--showproductname", "--json"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if rs_out.returncode == 0 and rs_out.stdout.strip():
            try:
                rs_data = json.loads(rs_out.stdout)
                card_list = rs_data.get("list", [])
                if not card_list:
                    card_list = [k for k in rs_data if k.startswith("card")]
                result["available"] = True
                result["backend"] = "rocm"
                result["device_count"] = len(card_list)
                result["driver_version"] = rs_data.get("version", "")
                # Try to get device name from first card
                for card_key in (card_list if card_list else []):
                    if isinstance(card_key, str) and card_key in rs_data:
                        info = rs_data[card_key]
                        if isinstance(info, dict):
                            name = info.get("Product Name", info.get("name", ""))
                            if name:
                                result["device_name"] = name
                                break
                return result
            except json.JSONDecodeError:
                pass
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try rocminfo for GFX architecture (AMD)
    try:
        ri_out = subprocess.run(
            ["rocminfo"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if ri_out.returncode == 0:
            for line in ri_out.stdout.split("\n"):
                m = re.search(r"(gfx\d+)", line, re.IGNORECASE)
                if m:
                    result["gfx_arch"] = m.group(1)
            if result["gfx_arch"]:
                result["available"] = True
                result["backend"] = "rocm"
                # Try to extract driver version from rocminfo output as well
                for line in ri_out.stdout.split("\n"):
                    if "Driver Version" in line or "Driver:" in line:
                        parts = line.split(":")
                        if len(parts) >= 2:
                            result["driver_version"] = parts[-1].strip()
                            break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # ────────────────────────────────────────────────────────────
    # Level 3: CPU fallback (result stays as-is)
    # ────────────────────────────────────────────────────────────
    return result


# ── Output Formatting ──────────────────────────────────────────────────

def print_report(info: Dict[str, Any]) -> None:
    """Print a human-readable GPU detection report."""
    print("=" * 60)
    print("  AMD ROCm — GPU Detection Report")
    print("=" * 60)

    status = "✅ GPU DETECTADA" if info["available"] else "⚠️  SOLO CPU"
    print(f"  Estado:    {status}")
    print(f"  Backend:   {info['backend'].upper()}")
    print(f"  Device:    {info['device_name'] or 'N/A'}")
    print(f"  Devices:   {info['device_count']}")
    print(f"  Driver:    {info['driver_version'] or 'N/A'}")
    print(f"  Torch:     {info['torch_version'] or 'N/A'}")
    print(f"  Torch CUDA: {info['torch_cuda']}")

    if info["hip_version"]:
        print(f"  HIP ver:   {info['hip_version']}")
    if info["cuda_version"]:
        print(f"  CUDA ver:  {info['cuda_version']}")
    if info["gfx_arch"]:
        print(f"  GFX arch:  {info['gfx_arch']}")

    print("=" * 60)


def print_json_report(info: Dict[str, Any]) -> None:
    """Print the detection report as JSON."""
    print(json.dumps(info, indent=2, ensure_ascii=False))


# ── Entry Point ────────────────────────────────────────────────────────

def main() -> int:
    """Entry point: detect GPU and print report. Returns exit code."""
    use_json = "--json" in sys.argv

    report = detect_gpu_backend()

    if use_json:
        print_json_report(report)
    else:
        print_report(report)

    return 0 if report["available"] else 1


if __name__ == "__main__":
    sys.exit(main())
