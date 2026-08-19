#!/usr/bin/env python3
"""
Prepare shader library training data from shader_ideas.md
Constitutional format: caption + tags + category + replay metadata
"""

import json
import re
import hashlib
from pathlib import Path
from typing import List, Dict

SHADER_IDEAS_PATH = Path("../../docs/shader_ideas.md")
OUTPUT_DIR = Path("processed")

CATEGORIES = {
    "procedural_materials": [
        "frosted glass", "iridescent", "snow", "lava", "asphalt",
        "rust", "marble", "sandstone", "ice", "basalt",
        "wood", "moss", "quartz", "granite", "car paint",
        "aluminum", "velvet", "satin", "clay", "concrete"
    ],
    "lighting_brdf": [
        "disney", "sheen", "clearcoat", "ggx", "subsurface",
        "skin", "hair", "thin-sheet", "retroreflective", "fluorescent"
    ],
    "volumetrics": [
        "fog", "god-ray", "smoke", "cloud", "fire",
        "underwater", "nebula", "dust", "snowflakes", "rain"
    ],
    "stylized_npr": [
        "toon", "halftone", "cross-hatch", "watercolor", "ink",
        "claymation", "pixel", "anime", "painterly", "chalkboard"
    ],
    "environment_sky": [
        "rayleigh", "mie", "aurora", "starfield", "bloom",
        "lightning", "foggy", "storm", "twinkling", "rainbow"
    ],
    "water_fluids": [
        "gerstner", "caustics", "foam", "waterfall", "river",
        "god-ray", "oil", "viscous", "bubble", "ice melt"
    ],
    "sci_fi_abstract": [
        "hologram", "glitch", "shield", "plasma", "hex",
        "neon", "circuit", "wormhole", "portal", "nanobot"
    ],
    "geometry_patterns": [
        "voronoi", "mandelbrot", "julia", "hex", "triangular",
        "kaleidoscope", "moire", "spiral", "radial", "checker"
    ],
    "animation_effects": [
        "heat", "shockwave", "dissolve", "embers", "accumulation",
        "droplets", "crawl", "pulse", "warp", "growth"
    ]
}


def categorize_shader(name: str) -> str:
    name_lower = name.lower()
    for category, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword in name_lower:
                return category
    return "uncategorized"


def generate_replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def parse_shader_ideas(filepath: Path) -> List[Dict]:
    shaders = []
    current_category = None

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            if line.startswith("## "):
                current_category = line[3:].strip()
                continue

            if line.startswith("- ") or (not line.startswith("#") and not line.startswith("**")):
                shader_name = line.lstrip("- ").strip()
                if shader_name and not shader_name.startswith("#"):
                    category = categorize_shader(shader_name)
                    replay_token = generate_replay_token(shader_name)

                    shaders.append({
                        "name": shader_name,
                        "category": category,
                        "tags": [category, "shader", "mandala"],
                        "caption": f"Shader for {shader_name} with constitutional rendering support",
                        "constitutional": True,
                        "replay_token": replay_token,
                        "source": "shader_ideas.md"
                    })

    return shaders


def generate_captions(shaders: List[Dict]) -> List[Dict]:
    enhanced = []
    for shader in shaders:
        base_caption = shader["caption"]
        tags = shader["tags"]

        captions = [
            base_caption,
            f"Procedural {shader['name']} material shader",
            f"Constitutional {shader['name']} for Mandala rendering",
            f"HIP assist kernel for {shader['name']}",
            f"RT4D validated {shader['name']} shader"
        ]

        for caption in captions:
            enhanced.append({
                **shader,
                "caption": caption
            })

    return enhanced


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Parsing shader ideas from {SHADER_IDEAS_PATH}...")
    shaders = parse_shader_ideas(SHADER_IDEAS_PATH)
    print(f"Found {len(shaders)} shader ideas")

    print("Generating enhanced captions...")
    enhanced = generate_captions(shaders)
    print(f"Generated {len(enhanced)} training samples")

    # Split 90/10 train/val
    split_idx = int(len(enhanced) * 0.9)
    train_data = enhanced[:split_idx]
    val_data = enhanced[split_idx:]

    train_path = OUTPUT_DIR / "shader_texture_train.jsonl"
    val_path = OUTPUT_DIR / "shader_texture_val.jsonl"

    with open(train_path, "w", encoding="utf-8") as f:
        for item in train_data:
            f.write(json.dumps(item) + "\n")

    with open(val_path, "w", encoding="utf-8") as f:
        for item in val_data:
            f.write(json.dumps(item) + "\n")

    print(f"Train: {train_path} ({len(train_data)} samples)")
    print(f"Val: {val_path} ({len(val_data)} samples)")

    stats = {}
    for item in enhanced:
        cat = item["category"]
        stats[cat] = stats.get(cat, 0) + 1

    print("\nCategory distribution:")
    for cat, count in sorted(stats.items()):
        print(f"  {cat}: {count}")


if __name__ == "__main__":
    main()
