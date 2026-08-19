#!/usr/bin/env python3
"""
Prepare texture library training data from texture_ideas.md
Constitutional format: caption + tags + category + replay metadata
"""

import json
import hashlib
from pathlib import Path
from typing import List, Dict

TEXTURE_IDEAS_PATH = Path("../../docs/texture_ideas.md")
OUTPUT_DIR = Path("processed")

CATEGORIES = {
    "natural_surfaces": [
        "snow", "ice", "mud", "earth", "sand",
        "pebble", "moss", "bark", "pine", "leaf",
        "grass", "clay", "basalt", "granite", "marble",
        "limestone", "riverbed", "coral", "seashell", "accumulation"
    ],
    "metal_industrial": [
        "steel", "rust", "aluminum", "copper", "galvanized",
        "diamond", "weld", "oil", "chrome", "titanium"
    ],
    "sci_fi_futuristic": [
        "circuit", "hologram", "shield", "plasma", "nanobot",
        "alien", "synthetic", "quantum", "neon", "forcefield"
    ],
    "fabric_clothing": [
        "denim", "wool", "silk", "leather", "canvas",
        "velvet", "knit", "mesh", "fur", "carpet"
    ],
    "stone_brick_building": [
        "brick", "mortar", "concrete", "plaster", "stucco",
        "cobblestone", "slate", "marble", "painted", "shingles"
    ],
    "wood": [
        "oak", "pine", "driftwood", "burnt", "polished",
        "bamboo", "cork", "stump", "splinter", "chips"
    ],
    "liquids": [
        "water", "oil", "honey", "blood", "lava",
        "slime", "soap", "alcohol", "mud", "wet"
    ],
    "stylized_npr": [
        "toon", "halftone", "comic", "watercolor", "chalkboard",
        "pixel", "retro", "anime", "brushstroke", "marker"
    ],
    "abstract_math": [
        "voronoi", "perlin", "worley", "mandelbrot", "julia",
        "hex", "spiral", "moire", "radial", "kaleidoscope"
    ]
}


def categorize_texture(name: str) -> str:
    name_lower = name.lower()
    for category, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword in name_lower:
                return category
    return "uncategorized"


def generate_replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def parse_texture_ideas(filepath: Path) -> List[Dict]:
    textures = []
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
                texture_name = line.lstrip("- ").strip()
                if texture_name and not texture_name.startswith("#"):
                    category = categorize_texture(texture_name)
                    replay_token = generate_replay_token(texture_name)

                    textures.append({
                        "name": texture_name,
                        "category": category,
                        "tags": [category, "texture", "mandala"],
                        "caption": f"Texture for {texture_name} with constitutional rendering support",
                        "constitutional": True,
                        "replay_token": replay_token,
                        "source": "texture_ideas.md"
                    })

    return textures


def generate_captions(textures: List[Dict]) -> List[Dict]:
    enhanced = []
    for texture in textures:
        base_caption = texture["caption"]
        captions = [
            base_caption,
            f"Procedural {texture['name']} texture map",
            f"Constitutional {texture['name']} for Mandala rendering",
            f"Normal map for {texture['name']} surface",
            f"Albedo texture for {texture['name']} material"
        ]

        for caption in captions:
            enhanced.append({
                **texture,
                "caption": caption
            })

    return enhanced


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Parsing texture ideas from {TEXTURE_IDEAS_PATH}...")
    textures = parse_texture_ideas(TEXTURE_IDEAS_PATH)
    print(f"Found {len(textures)} texture ideas")

    print("Generating enhanced captions...")
    enhanced = generate_captions(textures)
    print(f"Generated {len(enhanced)} training samples")

    split_idx = int(len(enhanced) * 0.9)
    train_data = enhanced[:split_idx]
    val_data = enhanced[split_idx:]

    train_path = OUTPUT_DIR / "texture_train.jsonl"
    val_path = OUTPUT_DIR / "texture_val.jsonl"

    with open(train_path, "w", encoding="utf-8") as f:
        for item in train_data:
            f.write(json.dumps(item) + "\n")

    with open(val_path, "w", encoding="utf-8") as f:
        for item in val_data:
            f.write(json.dumps(item) + "\n")

    print(f"Train: {train_path} ({len(train_data)} samples)")
    print(f"Val: {val_path} ({len(val_data)} samples)")


if __name__ == "__main__":
    main()
