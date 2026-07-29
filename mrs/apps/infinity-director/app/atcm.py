"""Adaptive Tile Complexity Minimization (ATCM).

Status: **partial**

What this module **does**:
- Builds a tile grid for a target frame size
- Estimates per-tile complexity from a cheap prepass buffer and/or prompt cues
- Assigns cheap vs full shading class per tile
- Estimates theoretical work reduction (labeled estimate, not measured FPS)
- Parallelizes the *classification* / plan build across cores (ThreadPoolExecutor)

What this module **does not** claim:
- Measured 2× wall-clock speedup (requires benchmarks)
- True per-tile Genblaze shading (Engine3D/RT4D CLIs are full-frame today)
- ATCM output is not Digital Printer SoT (`cpu.rt4d.print`)

Execution strategy today:
- Use ATCM plan to pick Director speed profile (fast vs beauty) and lane bias
- Attach full tile plan as evidence for future tile-aware renderers
"""

from __future__ import annotations

import math
import os
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Iterable

# Relative work units (dimensionless model — not milliseconds).
WORK_CHEAP = 0.25
WORK_FULL = 1.0
DEFAULT_TILE = 64
DEFAULT_THRESHOLD = 0.35
DEFAULT_PREPASS = 64


@dataclass(frozen=True)
class Tile:
    id: int
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class TileDecision:
    tile_id: int
    x: int
    y: int
    width: int
    height: int
    complexity: float
    mode: str  # "cheap" | "full"
    work: float


def num_cores() -> int:
    return max(1, os.cpu_count() or 1)


def make_tiles(width: int, height: int, tile_size: int = DEFAULT_TILE) -> list[Tile]:
    w = max(1, int(width))
    h = max(1, int(height))
    ts = max(8, int(tile_size))
    tiles: list[Tile] = []
    tid = 0
    for y in range(0, h, ts):
        for x in range(0, w, ts):
            tw = min(ts, w - x)
            th = min(ts, h - y)
            tiles.append(Tile(id=tid, x=x, y=y, width=tw, height=th))
            tid += 1
    return tiles


def prompt_complexity_cues(prompt: str | None) -> float:
    """0..1 cue from prompt keywords (heuristic prepass substitute)."""
    text = (prompt or "").lower()
    score = 0.15
    dense = ("tesseract", "lattice", "caustic", "glass", "chrome", "volumetric", "4d", "mandala")
    simple = ("empty", "sky", "wall", "flat", "solid", "warmup", "portrait", "mesh", "structure")
    for word in dense:
        if word in text:
            score += 0.08
    for word in simple:
        if word in text:
            score -= 0.04
    return max(0.0, min(1.0, score))


def _luma(r: int, g: int, b: int) -> float:
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def decode_png_rgba(data: bytes) -> tuple[int, int, list[tuple[int, int, int, int]]] | None:
    """Minimal PNG decoder (8-bit RGBA/RGB/Gray). Returns None if unsupported."""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    pos = 8
    width = height = None
    raw = b""
    color_type = None
    bit_depth = None
    while pos + 8 <= len(data):
        length = int.from_bytes(data[pos : pos + 4], "big")
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR" and length >= 13:
            width = int.from_bytes(chunk[0:4], "big")
            height = int.from_bytes(chunk[4:8], "big")
            bit_depth = chunk[8]
            color_type = chunk[9]
        elif ctype == b"IDAT":
            raw += chunk
        elif ctype == b"IEND":
            break
    if not width or not height or bit_depth != 8 or color_type not in {0, 2, 4, 6}:
        return None
    try:
        decompressed = zlib.decompress(raw)
    except zlib.error:
        return None
    if color_type == 2:
        bpp = 3
    elif color_type == 6:
        bpp = 4
    elif color_type == 0:
        bpp = 1
    else:
        bpp = 2  # gray+alpha
    stride = width * bpp
    expected = height * (1 + stride)
    if len(decompressed) < expected:
        return None
    pixels: list[tuple[int, int, int, int]] = []
    offset = 0
    prev = bytearray(stride)
    for _ in range(height):
        filter_type = decompressed[offset]
        offset += 1
        row = bytearray(decompressed[offset : offset + stride])
        offset += stride
        if filter_type == 1:  # Sub
            for i in range(stride):
                left = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + left) & 255
        elif filter_type == 2:  # Up
            for i in range(stride):
                row[i] = (row[i] + prev[i]) & 255
        elif filter_type == 3:  # Average
            for i in range(stride):
                left = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((left + prev[i]) // 2)) & 255
        elif filter_type == 4:  # Paeth
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row[i] = (row[i] + pr) & 255
        elif filter_type != 0:
            return None
        prev = row
        if bpp == 1:
            for i in range(width):
                v = row[i]
                pixels.append((v, v, v, 255))
        elif bpp == 2:
            for i in range(width):
                v = row[i * 2]
                a = row[i * 2 + 1]
                pixels.append((v, v, v, a))
        elif bpp == 3:
            for i in range(width):
                o = i * 3
                pixels.append((row[o], row[o + 1], row[o + 2], 255))
        else:
            for i in range(width):
                o = i * 4
                pixels.append((row[o], row[o + 1], row[o + 2], row[o + 3]))
    return width, height, pixels


def region_stats(
    pixels: list[tuple[int, int, int, int]],
    width: int,
    height: int,
    x0: int,
    y0: int,
    rw: int,
    rh: int,
) -> tuple[float, float]:
    """Return (color_variance, edge_density) in 0..1-ish ranges."""
    xs = max(0, x0)
    ys = max(0, y0)
    xe = min(width, x0 + rw)
    ye = min(height, y0 + rh)
    if xe <= xs or ye <= ys:
        return 0.0, 0.0
    lumas: list[float] = []
    for y in range(ys, ye):
        base = y * width
        for x in range(xs, xe):
            r, g, b, _a = pixels[base + x]
            lumas.append(_luma(r, g, b))
    n = len(lumas)
    if n == 0:
        return 0.0, 0.0
    mean = sum(lumas) / n
    var = sum((v - mean) ** 2 for v in lumas) / n
    # crude edge density via neighbor diffs
    edges = 0
    checks = 0
    for y in range(ys, ye - 1):
        for x in range(xs, xe - 1):
            i = y * width + x
            l0 = _luma(pixels[i][0], pixels[i][1], pixels[i][2])
            l1 = _luma(pixels[i + 1][0], pixels[i + 1][1], pixels[i + 1][2])
            l2 = _luma(pixels[i + width][0], pixels[i + width][1], pixels[i + width][2])
            if abs(l0 - l1) > 0.08 or abs(l0 - l2) > 0.08:
                edges += 1
            checks += 1
    edge_density = (edges / checks) if checks else 0.0
    # variance of luma in [0,1] is typically << 0.25; scale for scoring
    return min(1.0, var * 8.0), min(1.0, edge_density)


def tile_complexity(
    tile: Tile,
    *,
    frame_w: int,
    frame_h: int,
    prepass: tuple[int, int, list[tuple[int, int, int, int]]] | None,
    prompt_cue: float,
    alpha: float = 0.45,
    beta: float = 0.35,
    gamma: float = 0.20,
) -> float:
    if prepass is None:
        # No image: spatial falloff from center + prompt cue
        cx = (tile.x + tile.width / 2) / max(1, frame_w)
        cy = (tile.y + tile.height / 2) / max(1, frame_h)
        center = 1.0 - min(1.0, math.hypot(cx - 0.5, cy - 0.5) * 1.6)
        return max(0.0, min(1.0, 0.5 * prompt_cue + 0.5 * center * prompt_cue + 0.15 * center))

    pw, ph, pixels = prepass
    # Map full-frame tile rect into prepass coordinates
    sx = int(tile.x * pw / max(1, frame_w))
    sy = int(tile.y * ph / max(1, frame_h))
    sw = max(1, int(tile.width * pw / max(1, frame_w)))
    sh = max(1, int(tile.height * ph / max(1, frame_h)))
    var, edge = region_stats(pixels, pw, ph, sx, sy, sw, sh)
    material_proxy = prompt_cue  # without material IDs, prompt stands in
    c = alpha * var + beta * edge + gamma * material_proxy
    return max(0.0, min(1.0, c))


def estimate_work(decisions: Iterable[TileDecision]) -> dict[str, Any]:
    decisions = list(decisions)
    if not decisions:
        return {
            "tile_count": 0,
            "simple_tiles": 0,
            "complex_tiles": 0,
            "work_adaptive": 0.0,
            "work_full_baseline": 0.0,
            "estimated_work_ratio": 1.0,
            "estimated_speedup": 1.0,
            "label": "estimate_not_measured",
        }
    simple = sum(1 for d in decisions if d.mode == "cheap")
    complex_n = len(decisions) - simple
    work_adaptive = sum(d.work for d in decisions)
    work_full = WORK_FULL * len(decisions)
    ratio = work_adaptive / work_full if work_full else 1.0
    speedup = (1.0 / ratio) if ratio > 1e-9 else 1.0
    return {
        "tile_count": len(decisions),
        "simple_tiles": simple,
        "complex_tiles": complex_n,
        "simple_fraction": simple / len(decisions),
        "work_adaptive": round(work_adaptive, 4),
        "work_full_baseline": round(work_full, 4),
        "estimated_work_ratio": round(ratio, 4),
        "estimated_speedup": round(speedup, 4),
        "label": "estimate_not_measured",
        "note": (
            "Speedup is a work-unit model (cheap=0.25, full=1.0), not wall-clock. "
            "True 2× requires tile-aware shading in the renderer + benchmarks."
        ),
    }


def plan_atcm(
    *,
    width: int,
    height: int,
    prompt: str | None = None,
    tile_size: int = DEFAULT_TILE,
    threshold: float = DEFAULT_THRESHOLD,
    prepass_png: bytes | None = None,
    workers: int | None = None,
) -> dict[str, Any]:
    tiles = make_tiles(width, height, tile_size)
    cue = prompt_complexity_cues(prompt)
    prepass = decode_png_rgba(prepass_png) if prepass_png else None
    workers = max(1, workers or min(num_cores(), 8))

    def decide(tile: Tile) -> TileDecision:
        c = tile_complexity(tile, frame_w=width, frame_h=height, prepass=prepass, prompt_cue=cue)
        mode = "cheap" if c < threshold else "full"
        work = WORK_CHEAP if mode == "cheap" else WORK_FULL
        return TileDecision(
            tile_id=tile.id,
            x=tile.x,
            y=tile.y,
            width=tile.width,
            height=tile.height,
            complexity=round(c, 4),
            mode=mode,
            work=work,
        )

    decisions: list[TileDecision] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(decide, t) for t in tiles]
        for fut in as_completed(futures):
            decisions.append(fut.result())
    decisions.sort(key=lambda d: d.tile_id)
    work = estimate_work(decisions)
    mean_c = sum(d.complexity for d in decisions) / max(1, len(decisions))
    # Map plan → Director speed profile suggestion
    if mean_c < threshold * 0.85 and work["simple_fraction"] >= 0.55:
        suggested_profile = "fast"
    elif mean_c >= threshold:
        suggested_profile = "beauty"
    else:
        suggested_profile = "fast"

    return {
        "status": "partial",
        "algorithm": "ATCM",
        "print_sot": False,
        "authority": "preview_still",
        "frame": {"width": width, "height": height, "tile_size": tile_size, "threshold": threshold},
        "prepass": {
            "used_image": prepass is not None,
            "prompt_cue": round(cue, 4),
            "size": DEFAULT_PREPASS,
        },
        "workers": workers,
        "mean_complexity": round(mean_c, 4),
        "suggested_speed_profile": suggested_profile,
        "work_model": work,
        "tiles": [d.__dict__ for d in decisions],
        "execution_note": (
            "Genblaze/Engine3D stills are full-frame today. ATCM selects a global "
            "Director speed profile from the tile plan; per-tile shade modes are "
            "evidence for a future tile-aware soft-raster path."
        ),
    }


def suggested_dims_for_profile(profile_id: str) -> tuple[int, int]:
    if profile_id == "beauty":
        return 512, 512
    return 256, 256
