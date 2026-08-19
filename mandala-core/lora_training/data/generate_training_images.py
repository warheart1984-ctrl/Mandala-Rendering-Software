#!/usr/bin/env python3
"""
Constitutional Training Image Generator
Renders procedural textures using numpy + PIL for LoRA training.
Each image gets a constitutional caption with replay token.

Output: processed/images/ + processed/captions.jsonl
"""

import json
import hashlib
import os
import random
import math
from pathlib import Path
from typing import List, Dict, Tuple, Callable

import numpy as np
from PIL import Image

OUTPUT_DIR = Path("processed/images")
CAPTIONS_PATH = Path("processed/captions.jsonl")
IMG_SIZE = 512
SEED = 42  # Constitutional: deterministic


def replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ─── Noise Primitives ──────────────────────────────────────────────

def perlin2d(x: np.ndarray, y: np.ndarray, seed: int = 0) -> np.ndarray:
    """2D Perlin noise (vectorized)."""
    rng = np.random.RandomState(seed)
    perm = np.arange(256, dtype=int)
    rng.shuffle(perm)
    perm = np.tile(perm, 2)

    def fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    def grad(h, x, y):
        h = h & 3
        u = np.where(h < 2, x, y)
        v = np.where(h < 2, y, x)
        return np.where(h & 1, -u, u) + np.where(h & 2, -v, v)

    xi = x.astype(int) & 255
    yi = y.astype(int) & 255
    xf = x - x.astype(int)
    yf = y - y.astype(int)
    u = fade(xf)
    v = fade(yf)

    aa = perm[perm[xi] + yi]
    ab = perm[perm[xi] + yi + 1]
    ba = perm[perm[xi + 1] + yi]
    bb = perm[perm[xi + 1] + yi + 1]

    x1 = np.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    x2 = np.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return np.lerp(x1, x2, v)


def fbm(x: np.ndarray, y: np.ndarray, octaves: int = 6,
        lacunarity: float = 2.0, gain: float = 0.5, seed: int = 0) -> np.ndarray:
    """Fractal Brownian Motion."""
    sum_arr = np.zeros_like(x, dtype=float)
    amp = 1.0
    freq = 1.0
    max_amp = 0.0
    for i in range(octaves):
        sum_arr += perlin2d(x * freq, y * freq, seed + i * 17) * amp
        max_amp += amp
        amp *= gain
        freq *= lacunarity
    return sum_arr / max_amp


def worley2d(x: np.ndarray, y: np.ndarray, seed: int = 0) -> np.ndarray:
    """2D Worley (cell) noise."""
    rng = np.random.RandomState(seed)
    ix = np.floor(x).astype(int)
    iy = np.floor(y).astype(int)
    fx = x - ix
    fy = y - iy

    min_dist = np.full_like(x, 1e10, dtype=float)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            cx = ix + dx
            cy = iy + dy
            rng2 = np.random.RandomState(seed + cx * 73856093 + cy * 19349669)
            px = cx + rng2.uniform(0, 1, cx.shape)
            py = cy + rng2.uniform(0, 1, cy.shape)
            dist = np.sqrt((fx - dx - (rng2.uniform(0, 1, cx.shape)))**2 +
                          (fy - dy - (rng2.uniform(0, 1, cx.shape)))**2)
            min_dist = np.minimum(min_dist, dist)
    return min_dist


def make_grid(size: int, scale: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    """Create coordinate grid."""
    lin = np.linspace(0, scale, size, endpoint=False)
    return np.meshgrid(lin, lin)


# ─── Texture Renderers ─────────────────────────────────────────────

def render_marble(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 4.0)
    nx = x * 5 + fbm(x * 2, y * 2, seed=seed) * 5
    pattern = np.sin(nx + y * 2) * 0.5 + 0.5
    noise = fbm(x * 8, y * 8, octaves=4, seed=seed + 100) * 0.1
    val = np.clip(pattern + noise, 0, 1)
    r = val * 0.9 + 0.1
    g = val * 0.85 + 0.08
    b = val * 0.8 + 0.12
    return np.stack([r, g, b], axis=-1)


def render_wood(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 6.0)
    dist = np.sqrt((x - 3)**2 + (y - 3)**2)
    rings = np.sin(dist * 20 + fbm(x, y, octaves=3, seed=seed) * 2) * 0.5 + 0.5
    grain = fbm(x * 10, y * 10, octaves=4, seed=seed + 200) * 0.15
    val = np.clip(rings + grain, 0, 1)
    r = val * 0.6 + 0.3
    g = val * 0.4 + 0.2
    b = val * 0.15 + 0.05
    return np.stack([r, g, b], axis=-1)


def render_marble_veined(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 5.0)
    n1 = fbm(x * 3, y * 3, octaves=6, seed=seed)
    n2 = fbm(x * 6 + 10, y * 6 + 10, octaves=4, seed=seed + 50)
    veins = np.abs(np.sin((x * 8 + n1 * 10) * 3 + n2 * 5)) ** 0.5
    base = fbm(x * 2, y * 2, octaves=3, seed=seed + 60) * 0.2
    val = np.clip(veins * 0.7 + base + 0.15, 0, 1)
    r = val * 0.85 + 0.1
    g = val * 0.82 + 0.1
    b = val * 0.78 + 0.15
    return np.stack([r, g, b], axis=-1)


def render_lava(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 3.0)
    heat = fbm(x * 2, y * 2, octaves=6, seed=seed)
    flow = fbm(x * 3 + heat, y * 3 + heat, octaves=4, seed=seed + 300)
    val = np.clip(heat * 0.7 + flow * 0.3, -1, 1) * 0.5 + 0.5
    r = np.clip(val * 2.5, 0, 1)
    g = np.clip(val * 1.2 - 0.2, 0, 1)
    b = np.clip(val * 0.3, 0, 1)
    return np.stack([r, g, b], axis=-1)


def render_snow(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 3.0)
    base = fbm(x * 4, y * 4, octaves=5, seed=seed) * 0.08
    sparkle = np.random.RandomState(seed + 400).random((size, size)) * 0.05
    val = 0.88 + base + sparkle
    r = np.clip(val, 0.85, 1.0)
    g = np.clip(val, 0.87, 1.0)
    b = np.clip(val + 0.03, 0.9, 1.0)
    return np.stack([r, g, b], axis=-1)


def render_asphalt(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 8.0)
    coarse = fbm(x * 6, y * 6, octaves=4, seed=seed) * 0.2
    fine = fbm(x * 20, y * 20, octaves=3, seed=seed + 500) * 0.1
    val = np.clip(0.35 + coarse + fine, 0.15, 0.5)
    r = np.stack([val * 0.95] * 3, axis=-1)
    r[..., 1] = val[...] * 0.93
    r[..., 2] = val[...] * 0.9
    return r


def render_rust(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 5.0)
    base = fbm(x * 3, y * 3, octaves=5, seed=seed)
    patches = fbm(x * 8 + 5, y * 8 + 5, octaves=3, seed=seed + 600)
    val = np.clip(base * 0.6 + patches * 0.4 + 0.3, 0.1, 0.8)
    r = np.clip(val * 1.5, 0.2, 0.9)
    g = np.clip(val * 0.6, 0.05, 0.4)
    b = np.clip(val * 0.2, 0.02, 0.15)
    return np.stack([r, g, b], axis=-1)


def render_ice(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 4.0)
    cracks = fbm(x * 10, y * 10, octaves=5, seed=seed)
    base = fbm(x * 2, y * 2, octaves=3, seed=seed + 700)
    val = np.clip(base * 0.3 + 0.7, 0.6, 1.0)
    crack_val = np.clip(np.abs(cracks) * 3, 0, 0.3)
    r = np.clip(val - crack_val * 0.1, 0.6, 1.0)
    g = np.clip(val - crack_val * 0.05, 0.7, 1.0)
    b = np.clip(val + crack_val * 0.1, 0.75, 1.0)
    return np.stack([r, g, b], axis=-1)


def render_granite(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 6.0)
    n1 = fbm(x * 4, y * 4, octaves=5, seed=seed)
    n2 = fbm(x * 8 + 3, y * 8 + 3, octaves=4, seed=seed + 800)
    speckle = np.random.RandomState(seed + 801).random((size, size))
    val = np.clip(n1 * 0.5 + n2 * 0.3 + 0.3, 0.2, 0.7)
    r = val + speckle * 0.1
    g = val * 0.95 + speckle * 0.08
    b = val * 0.9 + speckle * 0.12
    return np.clip(np.stack([r, g, b], axis=-1), 0, 1)


def render_cloud(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 2.0)
    base = fbm(x * 3, y * 3, octaves=6, seed=seed)
    detail = fbm(x * 8, y * 8, octaves=4, seed=seed + 900) * 0.3
    val = np.clip(base + detail, -0.5, 1.0) * 0.5 + 0.5
    sky = np.ones((size, size, 3))
    sky[..., 0] = 0.5 + y * 0.2
    sky[..., 1] = 0.6 + y * 0.15
    sky[..., 2] = 0.9
    cloud = np.clip(val, 0, 1)
    cloud3 = np.stack([cloud] * 3, axis=-1)
    return np.clip(sky * (1 - cloud3 * 0.8) + cloud3 * 0.8, 0, 1)


def render_fog(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 3.0)
    density = fbm(x * 2, y * 2, octaves=5, seed=seed)
    flow = fbm(x * 1.5 + 10, y * 1.5 + 10, octaves=3, seed=seed + 1000)
    val = np.clip(density * 0.6 + flow * 0.4 + 0.3, 0.1, 0.9)
    r = val * 0.85 + 0.1
    g = val * 0.87 + 0.1
    b = val * 0.9 + 0.1
    return np.stack([r, g, b], axis=-1)


def render_watercolor(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 4.0)
    paper = fbm(x * 15, y * 15, octaves=3, seed=seed) * 0.1
    pigment1 = fbm(x * 2, y * 2, octaves=4, seed=seed + 1100) * 0.5 + 0.5
    pigment2 = fbm(x * 3 + 5, y * 3 + 5, octaves=3, seed=seed + 1101) * 0.5 + 0.5
    r = np.clip(pigment1 + paper, 0.2, 0.9)
    g = np.clip(pigment2 + paper, 0.3, 0.8)
    b = np.clip((pigment1 + pigment2) * 0.5 + paper + 0.2, 0.4, 0.9)
    return np.stack([r, g, b], axis=-1)


def render_halftone(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 16.0)
    pattern = fbm(x * 2, y * 2, octaves=3, seed=seed) * 0.5 + 0.5
    cx = (x * 4).round()
    cy = (y * 4).round()
    dots = ((cx % 2 == 0) & (cy % 2 == 0)).astype(float)
    val = np.clip(pattern * 0.6 + dots * 0.4 + 0.2, 0, 1)
    r = val * 0.9 + 0.05
    g = val * 0.1 + 0.02
    b = val * 0.1 + 0.05
    return np.stack([r, g, b], axis=-1)


def render_toon(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 3.0)
    light = fbm(x, y, octaves=2, seed=seed) * 0.5 + 0.5
    steps = 4
    quantized = np.round(light * steps) / steps
    r = quantized * 0.8 + 0.15
    g = quantized * 0.3 + 0.1
    b = quantized * 0.2 + 0.1
    return np.clip(np.stack([r, g, b], axis=-1), 0, 1)


def render_pixel_art(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    px = 16
    small = size // px
    rng = np.random.RandomState(seed + 1300)
    palette = np.array([[0.1, 0.1, 0.1], [0.8, 0.2, 0.2],
                        [0.2, 0.6, 0.2], [0.2, 0.2, 0.8],
                        [0.9, 0.9, 0.2], [0.9, 0.5, 0.1]])
    idx = rng.randint(0, len(palette), (small, small))
    img = palette[idx]
    img = np.repeat(np.repeat(img, px, axis=0), px, axis=1)
    return img


def render_voronoi_cell(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 6.0)
    rng = np.random.RandomState(seed + 1400)
    n_points = 30
    px = rng.uniform(0, 6, n_points)
    py = rng.uniform(0, 6, n_points)

    min_dist = np.full((size, size), 1e10, dtype=float)
    second_dist = np.full((size, size), 1e10, dtype=float)

    for i in range(n_points):
        dist = np.sqrt((x - px[i])**2 + (y - py[i])**2)
        mask = dist < min_dist
        second_dist = np.where(mask, min_dist, second_dist)
        min_dist = np.minimum(min_dist, dist)

    edge = np.clip(second_dist - min_dist, 0, 0.3) / 0.3
    val = min_dist / min_dist.max()
    r = np.clip(val * 0.6 + edge * 0.4, 0, 1)
    g = np.clip(val * 0.4 + edge * 0.3, 0, 1)
    b = np.clip(val * 0.8 + edge * 0.2, 0, 1)
    return np.stack([r, g, b], axis=-1)


def render_neon_grid(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 20.0)
    grid_x = np.abs(np.sin(x * math.pi)) ** 20
    grid_y = np.abs(np.sin(y * math.pi)) ** 20
    grid = np.clip(grid_x + grid_y, 0, 1)
    bg = fbm(x * 0.5, y * 0.5, octaves=3, seed=seed) * 0.1
    r = grid * 0.0 + bg
    g = grid * 0.9 + bg
    b = grid * 1.0 + bg
    return np.clip(np.stack([r, g, b], axis=-1), 0, 1)


def render_energy_shield(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x, y = make_grid(size, 4.0)
    cx, cy = 2.0, 2.0
    dist = np.sqrt((x - cx)**2 + (y - cy)**2)
    ring = np.abs(np.sin(dist * 8 - fbm(x, y, octaves=3, seed=seed) * 2)) ** 3
    hex_pattern = np.sin(x * 10) * np.sin(y * 10) * 0.2
    val = np.clip(ring + hex_pattern, 0, 1)
    r = val * 0.3
    g = val * 0.8
    b = val * 1.0
    return np.clip(np.stack([r, g, b], axis=-1), 0, 1)


def render_mandelbrot(size: int = IMG_SIZE, seed: int = SEED) -> np.ndarray:
    x = np.linspace(-2.5, 1.0, size)
    y = np.linspace(-1.25, 1.25, size)
    C = x[np.newaxis, :] + 1j * y[:, np.newaxis]

    Z = np.zeros_like(C)
    iterations = np.zeros((size, size), dtype=float)
    max_iter = 50

    for i in range(max_iter):
        mask = np.abs(Z) < 2
        Z[mask] = Z[mask] ** 2 + C[mask]
        iterations[mask] += 1

    val = iterations / max_iter
    r = np.clip(val * 3, 0, 1)
    g = np.clip(val * 1.5 - 0.3, 0, 1)
    b = np.clip(val * 2 - 0.1, 0, 1)
    return np.stack([r, g, b], axis=-1)


# ─── Registry ──────────────────────────────────────────────────────

TEXTURES: Dict[str, Dict] = {
    "marble": {"fn": render_marble, "category": "procedural_materials",
               "tags": ["marble", "stone", "veined", "classical"]},
    "wood": {"fn": render_wood, "category": "procedural_materials",
             "tags": ["wood", "grain", "rings", "natural"]},
    "marble_veined": {"fn": render_marble_veined, "category": "procedural_materials",
                      "tags": ["marble", "veined", "stone", "luxury"]},
    "lava": {"fn": render_lava, "category": "procedural_materials",
             "tags": ["lava", "molten", "fire", "volcanic"]},
    "snow": {"fn": render_snow, "category": "procedural_materials",
             "tags": ["snow", "white", "sparkle", "winter"]},
    "asphalt": {"fn": render_asphalt, "category": "procedural_materials",
                "tags": ["asphalt", "road", "coarse", "urban"]},
    "rust": {"fn": render_rust, "category": "procedural_materials",
             "tags": ["rust", "metal", "corroded", "weathered"]},
    "ice": {"fn": render_ice, "category": "procedural_materials",
            "tags": ["ice", "frozen", "cracks", "cold"]},
    "granite": {"fn": render_granite, "category": "procedural_materials",
                "tags": ["granite", "stone", "speckled", "rock"]},
    "cloud": {"fn": render_cloud, "category": "volumetrics",
              "tags": ["cloud", "sky", "volumetric", "atmosphere"]},
    "fog": {"fn": render_fog, "category": "volumetrics",
            "tags": ["fog", "mist", "atmospheric", "dense"]},
    "watercolor": {"fn": render_watercolor, "category": "stylized_npr",
                   "tags": ["watercolor", "artistic", "paint", "soft"]},
    "halftone": {"fn": render_halftone, "category": "stylized_npr",
                 "tags": ["halftone", "dots", "print", "comic"]},
    "toon": {"fn": render_toon, "category": "stylized_npr",
             "tags": ["toon", "cel", "quantized", "anime"]},
    "pixel_art": {"fn": render_pixel_art, "category": "stylized_npr",
                  "tags": ["pixel", "retro", "8bit", "tile"]},
    "voronoi": {"fn": render_voronoi_cell, "category": "geometry_patterns",
                "tags": ["voronoi", "cell", "organic", "procedural"]},
    "neon_grid": {"fn": render_neon_grid, "category": "sci_fi_abstract",
                  "tags": ["neon", "grid", "cyberpunk", "glow"]},
    "energy_shield": {"fn": render_energy_shield, "category": "sci_fi_abstract",
                      "tags": ["shield", "energy", "hex", "forcefield"]},
    "mandelbrot": {"fn": render_mandelbrot, "category": "geometry_patterns",
                   "tags": ["mandelbrot", "fractal", "mathematical", "infinite"]},
}

# Constitutional caption templates per category
CAPTION_TEMPLATES = {
    "procedural_materials": [
        "Procedural {name} material with physically-based rendering",
        "Constitutional {name} texture for Mandala rendering engine",
        "HIP assist validated {name} shader with replay token support",
        "RT4D compatible {name} surface material",
        "Procedurally generated {name} with deterministic noise functions",
    ],
    "volumetrics": [
        "Volumetric {name} effect for atmospheric rendering",
        "Constitutional {name} volume shader with perlin noise",
        "RT4D validated {name} volumetric scattering",
        "Mandala-compatible {name} atmosphere effect",
        "HIP assist {name} kernel for volumetric rendering",
    ],
    "stylized_npr": [
        "Stylized {name} NPR shader for artistic rendering",
        "Constitutional {name} non-photorealistic texture",
        "Anime-style {name} shader for Mandala engine",
        "Toon {name} effect with quantized lighting",
        "Artistic {name} texture with constitutional replay",
    ],
    "geometry_patterns": [
        "Procedural {name} geometric pattern shader",
        "Mathematical {name} pattern with constitutional validation",
        "RT4D compatible {name} fractal pattern",
        "Constitutional {name} algorithmic texture",
        "Deterministic {name} pattern for Mandala rendering",
    ],
    "sci_fi_abstract": [
        "Sci-fi {name} shader for futuristic rendering",
        "Constitutional {name} effect with glow and energy",
        "HIP assist {name} kernel for abstract effects",
        "RT4D validated {name} sci-fi material",
        "Mandala-compatible {name} holographic shader",
    ],
}


def generate_caption(name: str, category: str, seed: int) -> str:
    templates = CAPTION_TEMPLATES.get(category, CAPTION_TEMPLATES["procedural_materials"])
    rng = np.random.RandomState(seed + hash(name) % 10000)
    idx = rng.randint(0, len(templates))
    return templates[idx].format(name=name)


def generate_variations(name: str, render_fn: Callable, category: str,
                        tags: List[str], n_variations: int = 3) -> List[Dict]:
    """Generate multiple variations of a texture with different seeds."""
    samples = []
    for i in range(n_variations):
        seed_i = SEED + hash(name) % 10000 + i * 137
        img_arr = render_fn(IMG_SIZE, seed=seed_i)
        img_arr = np.clip(img_arr * 255, 0, 255).astype(np.uint8)
        img = Image.fromarray(img_arr, "RGB")

        fname = f"{name}_v{i}.png"
        fpath = OUTPUT_DIR / fname
        img.save(fpath, optimize=True)

        caption = generate_caption(name, category, seed_i)
        token = replay_token(caption + fname)

        samples.append({
            "image": fname,
            "caption": caption,
            "category": category,
            "tags": tags + ["stylized", "mandala", "constitutional"],
            "replay_token": token,
            "seed": seed_i,
            "size": IMG_SIZE,
        })

    return samples


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CAPTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"Constitutional Training Image Generator")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Textures: {len(TEXTURES)}")
    print(f"Image size: {IMG_SIZE}x{IMG_SIZE}")
    print()

    all_samples = []

    for name, info in TEXTURES.items():
        print(f"  Rendering {name}...", end=" ", flush=True)
        samples = generate_variations(
            name, info["fn"], info["category"], info["tags"], n_variations=3
        )
        all_samples.extend(samples)
        print(f"{len(samples)} variations")

    # Split 90/10 train/val
    random.seed(SEED)
    random.shuffle(all_samples)
    split = int(len(all_samples) * 0.9)
    train = all_samples[:split]
    val = all_samples[split:]

    # Write captions JSONL
    with open(CAPTIONS_PATH, "w", encoding="utf-8") as f:
        for s in all_samples:
            f.write(json.dumps(s) + "\n")

    train_path = CAPTIONS_PATH.parent / "train.jsonl"
    val_path = CAPTIONS_PATH.parent / "val.jsonl"
    with open(train_path, "w", encoding="utf-8") as f:
        for s in train:
            f.write(json.dumps(s) + "\n")
    with open(val_path, "w", encoding="utf-8") as f:
        for s in val:
            f.write(json.dumps(s) + "\n")

    print()
    print(f"Total: {len(all_samples)} images")
    print(f"Train: {len(train)} | Val: {len(val)}")
    print(f"Captions: {CAPTIONS_PATH}")
    print(f"Train split: {train_path}")
    print(f"Val split: {val_path}")

    # Category stats
    stats = {}
    for s in all_samples:
        stats[s["category"]] = stats.get(s["category"], 0) + 1
    print("\nCategory distribution:")
    for cat, count in sorted(stats.items()):
        print(f"  {cat}: {count}")


if __name__ == "__main__":
    main()
