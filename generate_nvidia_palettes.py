import json
from pathlib import Path

palettes_dir = Path(r"G:\Mandala Rendering Software\daniel_blueprint\styles\anime\v1\palettes")

palettes_data = [
    {
        "name": "Classic Shonen",
        "palette_id": "anime.nvidia.classic_shonen.v1",
        "colors": [
            [1.0, 0.898, 0.82, 1.0],  # skin #FFE5D0
            [0.051, 0.067, 0.165, 1.0],  # hair #0D1B2A
            [0.129, 0.149, 0.961, 1.0]   # eyes #2196F3
        ],
        "shadow_multiplier": 0.5,
        "highlight_boost": 1.1,
        "rim_color": [1.0, 1.0, 1.0, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 5,
        "notes": "Classic shonen anime palette. Warm skin, dark hair, blue eyes. Good for hero protagonists."
    },
    {
        "name": "Pastel Dream",
        "palette_id": "anime.nvidia.pastel_dream.v1",
        "colors": [
            [1.0, 0.961, 0.961, 1.0],  # skin #FFF0F5
            [0.847, 0.745, 0.859, 1.0],  # hair #D8BFD8
            [0.596, 1.0, 0.6, 1.0]       # eyes #98FF98
        ],
        "shadow_multiplier": 0.45,
        "highlight_boost": 1.15,
        "rim_color": [1.0, 1.0, 1.0, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 5,
        "notes": "Pastel dream palette. Soft pink skin, lavender hair, mint green eyes. Ideal for magical girl or gentle characters."
    },
    {
        "name": "Sunset Flame",
        "palette_id": "anime.nvidia.sunset_flame.v1",
        "colors": [
            [0.969, 0.776, 0.627, 1.0],  # skin #F2C6A0
            [0.698, 0.133, 0.133, 1.0],  # hair #B22222
            [1.0, 0.545, 0.0, 1.0]        # eyes #FF8C00
        ],
        "shadow_multiplier": 0.48,
        "highlight_boost": 1.25,
        "rim_color": [1.0, 0.85, 0.65, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 5,
        "notes": "Sunset flame palette. Tanned skin, red hair, orange eyes. Perfect for fiery characters and outdoor scenes."
    },
    {
        "name": "Midnight Moon",
        "palette_id": "anime.nvidia.midnight_moon.v1",
        "colors": [
            [0.961, 0.941, 0.969, 1.0],  # skin #F5F0F7
            [0.753, 0.753, 0.816, 1.0],  # hair #C0C0D0
            [0.416, 0.035, 0.686, 1.0]   # eyes #6A0DAD
        ],
        "shadow_multiplier": 0.42,
        "highlight_boost": 1.1,
        "rim_color": [1.0, 1.0, 1.0, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 4,
        "notes": "Midnight moon palette. Porcelain skin, silver hair, purple eyes. Perfect for mystic or night-time characters."
    },
    {
        "name": "Tropical Wave",
        "palette_id": "anime.nvidia.tropical_wave.v1",
        "colors": [
            [0.91, 0.765, 0.616, 1.0],   # skin #E8C39E
            [0.125, 0.698, 0.667, 1.0],   # hair #20B2AA
            [0.0, 0.412, 0.58, 1.0]        # eyes #006994
        ],
        "shadow_multiplier": 0.5,
        "highlight_boost": 1.18,
        "rim_color": [1.0, 1.0, 1.0, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 5,
        "notes": "Tropical wave palette. Light skin, teal hair, blue-green eyes. Ideal for beach/campus settings and bright personalities."
    }
]

for p in palettes_data:
    filepath = palettes_dir / f"{p['palette_id']}.json"
    write_data = {k: v for k, v in p.items() if k != "palette_id"}
    with open(filepath, 'w') as f:
        json.dump(write_data, f, indent=2)
    print(f"Saved {filepath.name}")

print(f"\nTotal {len(palettes_data)} NVIDIA-generated palettes added to {palettes_dir}")