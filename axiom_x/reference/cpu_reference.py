"""Axiom-X CPU Reference Implementation — for convergence verification.

STATUS: **partial** — matches legacy_efficient kernel semantics.

Provides deterministic CPU reference for Level 1 (numerical) convergence testing.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image


@dataclass
class CPUReferenceResult:
    """Result from CPU reference execution."""
    output: np.ndarray
    elapsed_ms: float
    output_hash: str
    pixel_hash: str
    numerical_summary: Dict[str, Any]


class CPUReferenceExecutor:
    """
    CPU reference implementation of Axiom-X kernels.

    Used for convergence verification Level 1 (numerical) against GPU results.
    """

    def _hash_sha256(self, data: Union[bytes, str]) -> str:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"

    def _hash_array(self, arr: np.ndarray) -> str:
        return self._hash_sha256(arr.tobytes())

    def _compute_numerical_summary(self, arr: np.ndarray) -> Dict[str, Any]:
        flat = arr.astype(np.float64).flatten()
        return {
            "min": float(np.nanmin(flat)),
            "max": float(np.nanmax(flat)),
            "mean": float(np.nanmean(flat)),
            "stddev": float(np.nanstd(flat)),
            "nanCount": int(np.isnan(flat).sum()),
            "infCount": int(np.isinf(flat).sum()),
            "percentiles": {
                "p1": float(np.nanpercentile(flat, 1)),
                "p50": float(np.nanpercentile(flat, 50)),
                "p99": float(np.nanpercentile(flat, 99)),
            }
        }

    def legacy_still_cpu(
        self,
        width: int,
        height: int,
        seed: float = 1.0,
    ) -> CPUReferenceResult:
        """
        CPU reference for legacy_efficient kernel.

        Matches the OpenCL kernel semantics exactly (fp32, smoothstep):
        - Center-weighted sphere + soft vignette (smoothstep(0.92, 0.55, r2))
        - Deterministic seed-dependent tint
        """
        start = time.perf_counter()

        x = np.arange(width, dtype=np.float32)
        y = np.arange(height, dtype=np.float32)

        u = (np.float32(2.0) * ((x + np.float32(0.5)) / np.float32(width))) - np.float32(1.0)
        v = (np.float32(2.0) * ((y + np.float32(0.5)) / np.float32(height))) - np.float32(1.0)

        uu = u[None, :] * u[None, :]
        vv = v[:, None] * v[:, None]
        r2 = uu + vv  # (h, w) fp32

        sphere = np.clip(np.float32(1.0) - r2 * np.float32(1.35), 0.0, 1.0)
        shade = sphere * sphere * (
            np.float32(0.55)
            + np.float32(0.45) * (np.float32(1.0) - u[None, :] * np.float32(0.35))
        )
        # smoothstep(0.92, 0.55, r2): t = clamp((x-e0)/(e1-e0)), t*t*(3-2t)
        t = np.clip(
            (r2 - np.float32(0.92)) / (np.float32(0.55) - np.float32(0.92)),
            0.0,
            1.0,
        )
        rim = t * t * (np.float32(3.0) - np.float32(2.0) * t)

        red = np.float32(0.12) + np.float32(0.78) * shade + np.float32(0.08) * rim
        grn = np.float32(0.08) + np.float32(0.22) * shade
        blu = np.float32(0.10) + np.float32(0.18) * shade + np.float32(0.05) * (np.float32(1.0) - rim)

        # Seed-dependent tint
        red = np.clip(red + np.float32(0.02) * np.float32(seed), 0.0, 1.0)

        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[..., 0] = (red * np.float32(255.0)).astype(np.uint8)
        rgba[..., 1] = (grn * np.float32(255.0)).astype(np.uint8)
        rgba[..., 2] = (blu * np.float32(255.0)).astype(np.uint8)
        rgba[..., 3] = 255

        elapsed_ms = (time.perf_counter() - start) * 1000.0

        output_hash = f"sha256:{hashlib.sha256(rgba.tobytes()).hexdigest()}"

        return CPUReferenceResult(
            output=rgba,
            elapsed_ms=elapsed_ms,
            output_hash=output_hash,
            pixel_hash=output_hash,
            numerical_summary={
                "min": float(np.min(rgba)),
                "max": float(np.max(rgba)),
                "mean": float(np.mean(rgba)),
                "stddev": float(np.std(rgba)),
                "nanCount": 0,
                "infCount": 0,
                "percentiles": {
                    "p1": float(np.percentile(rgba, 1)),
                    "p50": float(np.percentile(rgba, 50)),
                    "p99": float(np.percentile(rgba, 99)),
                }
            },
        )

    def save_output(self, result: CPUReferenceResult, out_path: Path):
        """Save CPU reference output."""
        out_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(result.output, mode="RGBA").save(out_path)


# Convenience function
def run_cpu_reference(
    kernel_name: str,
    width: int = 256,
    height: int = 256,
    seed: float = 1.0,
    out_dir: Optional[Path] = None,
) -> CPUReferenceResult:
    """Run CPU reference for specified kernel."""
    executor = CPUReferenceExecutor()

    if kernel_name == "legacy_still":
        result = executor.legacy_still_cpu(width, height, seed)
    else:
        raise ValueError(f"Unknown CPU reference kernel: {kernel_name}")

    if out_dir:
        out_path = out_dir / "cpu_reference.png"
        executor.save_output(result, out_path)

    return result