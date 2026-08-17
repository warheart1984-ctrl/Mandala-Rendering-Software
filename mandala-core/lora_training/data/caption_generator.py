#!/usr/bin/env python3
"""
Generate captions for stylized/NPR textures (AnythingV3 training)
Constitutional format with replay tokens
"""

import json
import hashlib
from pathlib import Path
from typing import List, Dict

OUTPUT_DIR = Path("processed")

STYLIZED_TEXTURES = [
    {"name": "Toon gradient", "category": "stylized_npr", "tags": ["toon", "gradient", "npr"]},
    {"name": "Halftone dot pattern", "category": "stylized_npr", "tags": ["halftone", "comic", "pattern"]},
    {"name": "Comic cross-hatch", "category": "stylized_npr", "tags": ["comic", "cross-hatch", "npr"]},
    {"name": "Watercolor bleed", "category": "stylized_npr", "tags": ["watercolor", "bleed", "artistic"]},
    {"name": "Chalkboard scribble", "category": "stylized_npr", "tags": ["chalkboard", "scribble", "artistic"]},
    {"name": "Pixel art tile", "category": "stylized_npr", "tags": ["pixel", "retro", "tile"]},
    {"name": "Retro CRT scanlines", "category": "stylized_npr", "tags": ["retro", "crt", "scanlines"]},
    {"name": "Anime specular streaks", "category": "stylized_npr", "tags": ["anime", "specular", "streaks"]},
    {"name": "Brushstroke canvas", "category": "stylized_npr", "tags": ["brushstroke", "canvas", "artistic"]},
    {"name": "Marker bleed texture", "category": "stylized_npr", "tags": ["marker", "bleed", "artistic"]},
]

CAPTION_TEMPLATES = [
    "{name} texture for constitutional rendering",
    "Stylized {name} with NPR shading",
    "Mandala-compatible {name} texture",
    "Anime-style {name} for procedural generation",
    "{name} with constitutional replay support",
]


def generate_replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def generate_training_data() -> List[Dict]:
    training_samples = []

    for texture in STYLIZED_TEXTURES:
        for template in CAPTION_TEMPLATES:
            caption = template.format(name=texture["name"])
            replay_token = generate_replay_token(caption)

            training_samples.append({
                "name": texture["name"],
                "category": texture["category"],
                "tags": texture["tags"] + ["stylized", "npr", "mandala"],
                "caption": caption,
                "constitutional": True,
                "replay_token": replay_token,
                "source": "stylized_library"
            })

    return training_samples


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Generating stylized texture captions...")
    samples = generate_training_data()
    print(f"Generated {len(samples)} training samples")

    split_idx = int(len(samples) * 0.9)
    train_data = samples[:split_idx]
    val_data = samples[split_idx:]

    train_path = OUTPUT_DIR / "stylized_texture_train.jsonl"
    val_path = OUTPUT_DIR / "stylized_texture_val.jsonl"

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
