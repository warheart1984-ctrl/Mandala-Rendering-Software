#!/usr/bin/env python3
"""OpenCL Tonga still — legacy-efficient GPU proof (R9 380 stand-in for HIP/ROCm).

STATUS: **partial**
- Proves OpenCL 2.0 AMD-APP can execute a kernel on device Tonga and write a PNG.
- Not photoreal diffusion; not ROCm/HIP; not Lemonade SD.
- Drive-G-1: honest substitute when Lemonade sd-cpp is blocked on this host.

Usage:
  python scripts/legacy-efficient/opencl_tonga_still.py \\
    --out docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png \\
    --report docs/4d-engine/proofs/legacy-efficient/opencl-tonga-probe.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


KERNEL = """
__kernel void legacy_still(
    __global uchar *rgba,
    const int width,
    const int height,
    const float time_seed
) {
    const int x = get_global_id(0);
    const int y = get_global_id(1);
    if (x >= width || y >= height) return;
    const int i = (y * width + x) * 4;

    // Center-weighted sphere + soft vignette (deterministic beauty stub)
    const float u = (2.0f * ((float)x + 0.5f) / (float)width) - 1.0f;
    const float v = (2.0f * ((float)y + 0.5f) / (float)height) - 1.0f;
    const float r2 = u * u + v * v;
    const float sphere = clamp(1.0f - r2 * 1.35f, 0.0f, 1.0f);
    const float shade = sphere * sphere * (0.55f + 0.45f * (1.0f - u * 0.35f));
    const float rim = smoothstep(0.92f, 0.55f, r2);

    float red = 0.12f + 0.78f * shade + 0.08f * rim;
    float grn = 0.08f + 0.22f * shade;
    float blu = 0.10f + 0.18f * shade + 0.05f * (1.0f - rim);
    // subtle seed-dependent tint (not RNG — fixed param)
    red = clamp(red + 0.02f * time_seed, 0.0f, 1.0f);

    rgba[i + 0] = (uchar)(red * 255.0f);
    rgba[i + 1] = (uchar)(grn * 255.0f);
    rgba[i + 2] = (uchar)(blu * 255.0f);
    rgba[i + 3] = (uchar)255;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="OpenCL Tonga legacy still proof")
    ap.add_argument("--width", type=int, default=256)
    ap.add_argument("--height", type=int, default=256)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png"),
    )
    ap.add_argument(
        "--report",
        type=Path,
        default=Path("docs/4d-engine/proofs/legacy-efficient/opencl-tonga-probe.json"),
    )
    ap.add_argument("--seed", type=float, default=1.0)
    args = ap.parse_args()

    report: dict = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "statusTag": "partial",
        "provider": "opencl-legacy",
        "purpose": "HIP/ROCm stand-in proof on Windows R9 380 (Tonga)",
        "ok": False,
    }

    try:
        import numpy as np
        import pyopencl as cl
        from PIL import Image
    except ImportError as exc:
        report["error"] = f"missing dependency: {exc}"
        report["help"] = "pip install pyopencl pillow numpy"
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 2

    try:
        platforms = cl.get_platforms()
        devices = [d for p in platforms for d in p.get_devices()]
        report["platforms"] = [
            {"name": p.name, "version": p.version, "vendor": p.vendor} for p in platforms
        ]
        report["devices"] = [
            {
                "name": d.name,
                "board": getattr(d, "board_name_amd", None)
                or str(getattr(d, "name", "")),
                "version": d.version,
                "max_compute_units": d.max_compute_units,
                "global_mem_size": d.global_mem_size,
            }
            for d in devices
        ]
        if not devices:
            raise RuntimeError("no OpenCL devices")

        # Prefer Tonga / R9 380
        device = next(
            (
                d
                for d in devices
                if "tonga" in d.name.lower() or "380" in d.name.lower()
            ),
            devices[0],
        )
        ctx = cl.Context([device])
        queue = cl.CommandQueue(ctx)
        prg = cl.Program(ctx, KERNEL).build()

        w, h = int(args.width), int(args.height)
        buf = np.zeros((h, w, 4), dtype=np.uint8)
        cl_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, buf.nbytes)

        t0 = time.perf_counter()
        prg.legacy_still(
            queue,
            (w, h),
            None,
            cl_buf,
            np.int32(w),
            np.int32(h),
            np.float32(args.seed),
        )
        cl.enqueue_copy(queue, buf, cl_buf)
        queue.finish()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        args.out.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(buf, mode="RGBA").save(args.out)

        report.update(
            {
                "ok": True,
                "deviceName": device.name,
                "width": w,
                "height": h,
                "elapsedMs": round(elapsed_ms, 3),
                "outPath": str(args.out).replace("\\", "/"),
                "byteLength": args.out.stat().st_size,
                "note": (
                    "OpenCL kernel wrote RGBA still on AMD Tonga. "
                    "Not Lemonade SD; not ROCm/HIP. Partial GPU beauty stand-in."
                ),
            }
        )
    except Exception as exc:  # noqa: BLE001 — capture for proof JSON
        report["ok"] = False
        report["error"] = f"{type(exc).__name__}: {exc}"

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
