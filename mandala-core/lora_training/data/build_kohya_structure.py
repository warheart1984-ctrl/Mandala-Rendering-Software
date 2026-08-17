#!/usr/bin/env python3
"""
Build kohya_ss-compatible training directory from our processed dataset.
Creates: TRAIN_DIR/<class_name>/<image>.png + <image>.txt
"""

import json
import shutil
from pathlib import Path

BASE = Path(r"E:\Mandala-Rendering-Software")
PROCESSED = BASE / "mandala-core" / "lora_training" / "processed"
IMAGES = PROCESSED / "images"
CAPTIONS = PROCESSED / "captions.jsonl"
TRAIN_DIR = BASE / "Anime Pictures for training" / "kohya_ready"


def main():
    # Clean previous output
    if TRAIN_DIR.exists():
        shutil.rmtree(TRAIN_DIR)
    TRAIN_DIR.mkdir(parents=True, exist_ok=True)

    # Load captions
    captions = {}
    with open(CAPTIONS, "r", encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line.strip())
            captions[entry["image"]] = entry

    # Group by category -> kohya class folder
    for img_name, entry in captions.items():
        category = entry["category"]
        src = IMAGES / img_name
        if not src.exists():
            print(f"  Skip {img_name}: not found")
            continue

        class_dir = TRAIN_DIR / category
        class_dir.mkdir(exist_ok=True)

        # Copy image
        dst_img = class_dir / img_name
        shutil.copy2(src, dst_img)

        # Write caption .txt
        txt_name = Path(img_name).stem + ".txt"
        dst_txt = class_dir / txt_name
        with open(dst_txt, "w", encoding="utf-8") as f:
            f.write(entry["caption"])

    # Count results
    total = 0
    for class_dir in sorted(TRAIN_DIR.iterdir()):
        if class_dir.is_dir():
            n = len(list(class_dir.glob("*.png")))
            total += n
            print(f"  {class_dir.name}/: {n} images")

    print(f"\nTotal: {total} images in {TRAIN_DIR}")


if __name__ == "__main__":
    main()
