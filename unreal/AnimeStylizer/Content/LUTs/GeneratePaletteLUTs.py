#!/usr/bin/env python3
# Copyright 2026 MRS. All Rights Reserved.
"""Generate 256x1 anime palette LUT PNGs (6 presets).

Status: partial — emits offline LUT assets; Unreal import settings are operator-side.

Usage:
  python GeneratePaletteLUTs.py
  python GeneratePaletteLUTs.py --out-dir ./generated

Requires: pillow (preferred). Falls back to a minimal uncompressed PNG writer if
Pillow is unavailable so the script still emits the six LUTs.
"""

from __future__ import annotations

import argparse
import struct
import zlib
from pathlib import Path

LUT_SIZE = 256

PALETTES: dict[str, list[tuple[float, float, float]]] = {
    "AnimePalette_Morning": [
        (0.05, 0.02, 0.08),
        (0.15, 0.08, 0.12),
        (0.35, 0.15, 0.10),
        (0.65, 0.35, 0.15),
        (0.95, 0.65, 0.25),
        (1.00, 0.85, 0.45),
    ],
    "AnimePalette_Noon": [
        (0.10, 0.15, 0.20),
        (0.25, 0.35, 0.40),
        (0.50, 0.65, 0.55),
        (0.80, 0.90, 0.70),
        (0.95, 0.98, 0.85),
        (1.00, 1.00, 0.95),
    ],
    "AnimePalette_Night": [
        (0.02, 0.02, 0.05),
        (0.08, 0.06, 0.12),
        (0.18, 0.15, 0.25),
        (0.35, 0.30, 0.45),
        (0.60, 0.55, 0.70),
        (0.85, 0.80, 0.90),
    ],
    "AnimePalette_Sunset": [
        (0.08, 0.03, 0.05),
        (0.25, 0.08, 0.10),
        (0.55, 0.20, 0.15),
        (0.85, 0.45, 0.20),
        (1.00, 0.75, 0.30),
        (1.00, 0.95, 0.60),
    ],
    "AnimePalette_Cyberpunk": [
        (0.03, 0.00, 0.05),
        (0.15, 0.00, 0.30),
        (0.40, 0.05, 0.60),
        (0.80, 0.20, 0.80),
        (1.00, 0.50, 1.00),
        (1.00, 0.80, 1.00),
    ],
    "AnimePalette_Monochrome": [
        (0.00, 0.00, 0.00),
        (0.15, 0.15, 0.15),
        (0.35, 0.35, 0.35),
        (0.60, 0.60, 0.60),
        (0.85, 0.85, 0.85),
        (1.00, 1.00, 1.00),
    ],
}


def lerp(a: float, b: float, t: float) -> float:
    return a * (1.0 - t) + b * t


def sample_stops(colors: list[tuple[float, float, float]], t: float) -> tuple[float, float, float]:
    if len(colors) == 1:
        return colors[0]
    segment = t * (len(colors) - 1)
    idx = min(int(segment), len(colors) - 2)
    alpha = segment - idx
    c1 = colors[idx]
    c2 = colors[idx + 1]
    return (
        lerp(c1[0], c2[0], alpha),
        lerp(c1[1], c2[1], alpha),
        lerp(c1[2], c2[2], alpha),
    )


def build_lut_rgba(colors: list[tuple[float, float, float]], size: int = LUT_SIZE) -> bytes:
    pixels = bytearray()
    for i in range(size):
        t = i / (size - 1)
        r, g, b = sample_stops(colors, t)
        pixels.extend(
            (
                max(0, min(255, int(round(r * 255.0)))),
                max(0, min(255, int(round(g * 255.0)))),
                max(0, min(255, int(round(b * 255.0)))),
                255,
            )
        )
    return bytes(pixels)


def write_png_rgba(path: Path, width: int, height: int, rgba: bytes) -> None:
    try:
        from PIL import Image  # type: ignore

        img = Image.frombytes("RGBA", (width, height), rgba)
        img.save(path)
        return
    except ImportError:
        pass

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def generate_all(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, colors in PALETTES.items():
        path = out_dir / f"{name}.png"
        write_png_rgba(path, LUT_SIZE, 1, build_lut_rgba(colors))
        written.append(path)
        print(f"Saved {path}")
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate AnimeStylizer 256x1 palette LUTs")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Output directory (default: this script's directory)",
    )
    args = parser.parse_args()
    paths = generate_all(args.out_dir)
    print(f"All palette LUTs generated ({len(paths)}).")
    print("Unreal import: Compression=TC_VectorDisplacementmap, SRGB=False, Filter=TF_Linear, NoMipmaps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
