import json
from pathlib import Path

palettes_dir = Path(r"G:\Mandala Rendering Software\daniel_blueprint\styles\anime\v1\palettes")

def lerp(a, b, t):
    return a + (b - a) * t

def mix_colors(c1, c2, steps=100):
    return [
        [round(lerp(c1[0], c2[0], i/(steps-1)), 4),
         round(lerp(c1[1], c2[1], i/(steps-1)), 4),
         round(lerp(c1[2], c2[2], i/(steps-1)), 4),
         round(lerp(c1[3], c2[3], i/(steps-1)), 4)]
        for i in range(steps)
    ]

mixes = [
    {
        "name": "Red to Blue",
        "palette_id": "anime.mix.red_blue.v1",
        "c1": [1.0, 0.0, 0.0, 1.0],
        "c2": [0.0, 0.0, 1.0, 1.0],
        "notes": "100-step gradient from red to blue. Good for transition effects and magic effects."
    },
    {
        "name": "Green to Orange",
        "palette_id": "anime.mix.green_orange.v1",
        "c1": [0.0, 1.0, 0.0, 1.0],
        "c2": [1.0, 0.5, 0.0, 1.0],
        "notes": "100-step complementary gradient green→orange. Great for warm-cool contrast."
    },
    {
        "name": "Purple to Cyan",
        "palette_id": "anime.mix.purple_cyan.v1",
        "c1": [0.5, 0.0, 0.5, 1.0],
        "c2": [0.0, 1.0, 1.0, 1.0],
        "notes": "100-step cool gradient purple→cyan. Ideal for mystical or aquatic scenes."
    },
    {
        "name": "Yellow to Red",
        "palette_id": "anime.mix.yellow_red.v1",
        "c1": [1.0, 1.0, 0.0, 1.0],
        "c2": [1.0, 0.0, 0.0, 1.0],
        "notes": "100-step warm gradient yellow→red. Fits fire, heat, and energy visuals."
    },
    {
        "name": "Black to White",
        "palette_id": "anime.mix.bw.v1",
        "c1": [0.0, 0.0, 0.0, 1.0],
        "c2": [1.0, 1.0, 1.0, 1.0],
        "notes": "100-step grayscale ramp. Perfect for value studies and brightness gradients."
    },
    {
        "name": "Pastel Pink to Light Blue",
        "palette_id": "anime.mix.pink_blue.v1",
        "c1": [1.0, 0.8, 0.9, 1.0],
        "c2": [0.6, 0.8, 1.0, 1.0],
        "notes": "100-step pastel gradient pink→light blue. Soft and soothing for backgrounds."
    }
]

for m in mixes:
    colors = mix_colors(m["c1"], m["c2"], 100)
    palette_data = {
        "name": m["name"],
        "palette_id": m["palette_id"],
        "colors": colors,
        "shadow_multiplier": 0.45,
        "highlight_boost": 1.1,
        "rim_color": [1.0, 1.0, 1.0, 1.0],
        "line_color": [0.0, 0.0, 0.0, 1.0],
        "quantization_levels": 6,
        "notes": m["notes"]
    }
    filepath = palettes_dir / f"{m['palette_id']}.json"
    with open(filepath, 'w') as f:
        json.dump(palette_data, f, indent=2)
    print(f"Saved {filepath.name} ({len(colors)} colors)")

print(f"\nTotal {len(mixes)} mix palettes generated in {palettes_dir}")