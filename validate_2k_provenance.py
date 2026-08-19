#!/usr/bin/env python3
import json
from pathlib import Path
from PIL import Image

OUTPUT_DIR = Path("Anime Pictures for training/lora_out/diffusers_to_mandala")
render_path = OUTPUT_DIR / "rendered_2k_provenance.png"
meta_path = OUTPUT_DIR / "render_meta.json"

img = Image.open(render_path)
w, h = img.size
print(f"[VALIDATE] Render size: {w}x{h}")
assert w == 2048 and h == 2048, "Not 2k"

meta = json.loads(meta_path.read_text())
print(f"[VALIDATE] Intent ID: {meta['intent_id']}")
print(f"[VALIDATE] Material: {meta['material']}")
print(f"[VALIDATE] SPP: {meta['spp']}")
print(f"[VALIDATE] Constitutional hash: {meta['constitutional_hash'][:16]}...")

print("[VALIDATE] 2K provenance output VALID")
