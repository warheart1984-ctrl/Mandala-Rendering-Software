#!/usr/bin/env python3
"""Multi-backend GPU detection (rocm-setup / rocm-doctor patterns adapted).

STATUS: **partial** / diagnose scaffolding — does NOT install ROCm/HIP/CUDA,
does NOT claim an MRS HIP print path, does NOT make Digital Printer AMD SoT.

Exit codes:
  0 — at least one GPU backend tool reported a device (cuda or rocm)
  1 — CPU-only / no GPU tooling detected
  2 — unexpected script error

Usage:
  python scripts/detect-gpu-backend.py
  python scripts/detect-gpu-backend.py --json
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
from typing import Any


def _run(cmd: list[str], timeout: float = 8.0) -> tuple[bool, str]:
    try:
        out = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        text = (out.stdout or "").strip() or (out.stderr or "").strip()
        return out.returncode == 0, text
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired) as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _detect_nvidia() -> dict[str, Any]:
    if not shutil.which("nvidia-smi"):
        return {
            "backend": "cuda",
            "available": False,
            "statusTag": "absent",
            "note": "nvidia-smi not on PATH",
        }
    ok, text = _run(
        [
            "nvidia-smi",
            "--query-gpu=name,driver_version,memory.total",
            "--format=csv,noheader",
        ]
    )
    if not ok:
        low = text.lower()
        perm = "permission" in low or "administrator" in low or "access is denied" in low
        return {
            "backend": "cuda",
            "available": False,
            "statusTag": "partial" if perm else "absent",
            "note": (
                "nvidia-smi present but insufficient permissions — elevate or "
                "fix driver access; CUDA print SoT still absent"
                if perm
                else "nvidia-smi failed"
            ),
            "error": text[:500],
        }
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    first = lines[0].split(",") if lines else []
    name = first[0].strip() if first else ""
    return {
        "backend": "cuda",
        "available": True,
        "statusTag": "partial",
        "device_count": len(lines),
        "device_name": name,
        "note": "NVIDIA tool visible — MRS CUDA print SoT still absent",
        "raw_lines": lines[:8],
    }


def _detect_rocm() -> dict[str, Any]:
    # Linux: rocm-smi / rocminfo. Windows: hipInfo if HIP SDK installed.
    if shutil.which("rocm-smi"):
        ok, text = _run(["rocm-smi", "--showproductname"])
        return {
            "backend": "rocm",
            "available": ok,
            "statusTag": "partial" if ok else "absent",
            "tool": "rocm-smi",
            "note": (
                "ROCm tool visible — MRS HIP print path still absent"
                if ok
                else "rocm-smi failed"
            ),
            "snippet": text[:400],
        }
    if shutil.which("rocminfo"):
        ok, text = _run(["rocminfo"])
        gfx = ""
        for line in text.splitlines():
            if "gfx" in line.lower() and "Name:" in line:
                gfx = line.strip()
                break
        return {
            "backend": "rocm",
            "available": ok,
            "statusTag": "partial" if ok else "absent",
            "tool": "rocminfo",
            "gfx": gfx or None,
            "note": (
                "rocminfo visible — MRS HIP print path still absent"
                if ok
                else "rocminfo failed"
            ),
        }
    if shutil.which("hipInfo") or shutil.which("hipInfo.exe"):
        tool = "hipInfo.exe" if shutil.which("hipInfo.exe") else "hipInfo"
        ok, text = _run([tool])
        return {
            "backend": "rocm",
            "available": ok,
            "statusTag": "partial" if ok else "absent",
            "tool": tool,
            "note": (
                "HIP SDK hipInfo visible on Windows — MRS HIP print path still absent"
                if ok
                else "hipInfo failed"
            ),
            "snippet": text[:400],
        }
    return {
        "backend": "rocm",
        "available": False,
        "statusTag": "absent",
        "note": "no rocm-smi / rocminfo / hipInfo on PATH (expected on NVIDIA-only hosts)",
    }


def _detect_torch() -> dict[str, Any]:
    try:
        import torch  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "statusTag": "skipped",
            "note": f"torch not importable ({type(exc).__name__})",
        }
    cuda_ok = bool(torch.cuda.is_available())
    hip = getattr(torch.version, "hip", None)
    cuda_ver = getattr(torch.version, "cuda", None)
    backend = "cpu"
    if cuda_ok and hip:
        backend = "rocm"
    elif cuda_ok:
        backend = "cuda"
    return {
        "available": cuda_ok,
        "statusTag": "partial" if cuda_ok else "absent",
        "backend": backend,
        "torch_version": torch.__version__,
        "hip_version": hip,
        "cuda_version": cuda_ver,
        "device_count": torch.cuda.device_count() if cuda_ok else 0,
        "device_name": torch.cuda.get_device_name(0) if cuda_ok else None,
        "note": "torch.cuda API used for both CUDA and ROCm — not MRS print SoT",
    }


def detect() -> dict[str, Any]:
    nvidia = _detect_nvidia()
    rocm = _detect_rocm()
    torch_info = _detect_torch()
    if nvidia.get("available"):
        primary = "cuda"
    elif rocm.get("available"):
        primary = "rocm"
    elif torch_info.get("available"):
        primary = str(torch_info.get("backend") or "cuda")
    else:
        primary = "cpu"
    return {
        "skill": "rocm-setup detect-gpu + rocm-doctor honesty",
        "platform": platform.platform(),
        "primary_backend": primary,
        "available": primary != "cpu",
        "statusTag": "partial" if primary != "cpu" else "absent",
        "honesty": (
            "Detection only. MRS Digital Printer has no HIP/CUDA beauty SoT. "
            "Lemonade local diffusion (GENBLAZE_IMAGE_BACKEND=lemonade) is assist, "
            "not deterministic RT4D print."
        ),
        "nvidia": nvidia,
        "rocm": rocm,
        "torch": torch_info,
        "hip_print_path": "absent",
        "cuda_print_path": "absent",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        report = detect()
    except Exception as exc:  # noqa: BLE001
        print(f"detect-gpu-backend error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=== MRS GPU backend detection ===")
        print(f"primary: {report['primary_backend']}  statusTag: {report['statusTag']}")
        print(f"nvidia:  available={report['nvidia'].get('available')} — {report['nvidia'].get('note')}")
        print(f"rocm:    available={report['rocm'].get('available')} — {report['rocm'].get('note')}")
        print(f"torch:   {report['torch'].get('note')}")
        print(report["honesty"])
    return 0 if report["available"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
