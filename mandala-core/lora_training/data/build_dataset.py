#!/usr/bin/env python3
"""
Full Training Dataset Builder
1. Captions existing anime images from "Anime Pictures for training"
2. Generates procedural textures from shader/texture library
3. Outputs unified training dataset for LoRA training

Output structure:
  processed/
    images/        (all PNGs normalized to 512x512)
    train.jsonl    (training split captions)
    val.jsonl      (validation split captions)
    captions.jsonl (all captions)
"""

import json
import hashlib
import os
import random
import math
import shutil
from pathlib import Path
from typing import List, Dict, Tuple
from PIL import Image
import numpy as np

# ─── Paths ──────────────────────────────────────────────────────────
BASE = Path(r"E:\Mandala-Rendering-Software")
ANIME_DIR = BASE / "Anime Pictures for training"
OUTPUT = BASE / "mandala-core" / "lora_training" / "processed"
IMG_DIR = OUTPUT / "images"
IMG_SIZE = 512
SEED = 42


def replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ─── Part 1: Caption existing anime images ──────────────────────────

ANIME_CAPTION_TEMPLATES = [
    "Anime-style illustration with {style} shading and vibrant colors",
    "Stylized anime character art, {style} rendering, high detail",
    "Japanese anime illustration, {style} aesthetic, constitutional replay",
    "Hand-drawn anime style with {style} color palette",
    "Anime character portrait, {style} lighting, Mandala-compatible",
]

ANIME_STYLES = [
    "cel-shaded", "soft-painted", "watercolor", "digital",
    "pixel-art", "pastel", "neon", "monochrome",
    "warm-toned", "cool-toned", "high-contrast", "muted",
]


def caption_anime_images() -> List[Dict]:
    """Generate captions for existing anime images."""
    samples = []
    exts = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".bmp"}

    files = sorted([f for f in ANIME_DIR.iterdir()
                    if f.suffix.lower() in exts and f.is_file()])

    print(f"Found {len(files)} anime images")

    rng = np.random.RandomState(SEED)
    for i, fpath in enumerate(files):
        # Determine style based on filename hash
        style_idx = (hash(fpath.name) + i) % len(ANIME_STYLES)
        style = ANIME_STYLES[style_idx]
        template_idx = (hash(fpath.name) + i * 3) % len(ANIME_CAPTION_TEMPLATES)
        caption = ANIME_CAPTION_TEMPLATES[template_idx].format(style=style)

        # Load and normalize to PNG
        try:
            img = Image.open(fpath).convert("RGB")
            img = img.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
        except Exception as e:
            print(f"  Skip {fpath.name}: {e}")
            continue

        out_name = f"anime_{i:04d}.png"
        out_path = IMG_DIR / out_name
        img.save(out_path, "PNG")

        token = replay_token(caption + out_name)
        samples.append({
            "image": out_name,
            "caption": caption,
            "category": "anime",
            "tags": ["anime", "stylized", "character", "mandala", "constitutional", style],
            "replay_token": token,
            "source": "anime_pictures",
            "size": IMG_SIZE,
            "original_file": fpath.name,
        })

    return samples


# ─── Part 2: Procedural texture generation ──────────────────────────

def perlin2d(x, y, seed=0):
    rng = np.random.RandomState(seed)
    perm = np.arange(256, dtype=int)
    rng.shuffle(perm)
    perm = np.tile(perm, 2)
    def fade(t): return t*t*t*(t*(t*6-15)+10)
    def grad(h, x, y):
        h = h & 3
        u = np.where(h<2, x, y)
        v = np.where(h<2, y, x)
        return np.where(h&1,-u,u)+np.where(h&2,-v,v)
    xi = np.floor(x).astype(int)&255; yi = np.floor(y).astype(int)&255
    xf = x-np.floor(x); yf = y-np.floor(y)
    u = fade(xf); v = fade(yf)
    aa = perm[perm[xi]+yi]; ab = perm[perm[xi]+yi+1]
    ba = perm[perm[xi+1]+yi]; bb = perm[perm[xi+1]+yi+1]
    x1 = grad(aa,xf,yf)*(1-u)+grad(ba,xf-1,yf)*u
    x2 = grad(ab,xf,yf-1)*(1-u)+grad(bb,xf-1,yf-1)*u
    return x1*(1-v)+x2*v


def fbm(x, y, octaves=6, lac=2.0, gain=0.5, seed=0):
    s=np.zeros_like(x,float); a=1.0; f=1.0; m=0.0
    for i in range(octaves):
        s+=perlin2d(x*f,y*f,seed+i*17)*a; m+=a; a*=gain; f*=lac
    return s/m


def grid(size, scale=1.0):
    l=np.linspace(0,scale,size,endpoint=False)
    return np.meshgrid(l,l)


def tex_marble(sz,seed):
    x,y=grid(sz,4); nx=x*5+fbm(x*2,y*2,seed=seed)*5
    p=np.sin(nx+y*2)*.5+.5; n=fbm(x*8,y*8,4,seed=seed+100)*.1
    v=np.clip(p+n,0,1)
    return np.stack([v*.9+.1, v*.85+.08, v*.8+.12],-1)

def tex_wood(sz,seed):
    x,y=grid(sz,6); d=np.sqrt((x-3)**2+(y-3)**2)
    r=np.sin(d*20+fbm(x,y,3,seed=seed)*2)*.5+.5
    g=fbm(x*10,y*10,4,seed=seed+200)*.15
    v=np.clip(r+g,0,1)
    return np.stack([v*.6+.3, v*.4+.2, v*.15+.05],-1)

def tex_lava(sz,seed):
    x,y=grid(sz,3); h=fbm(x*2,y*2,6,seed=seed)
    fl=fbm(x*3+h,y*3+h,4,seed=seed+300)
    v=np.clip(h*.7+fl*.3,-1,1)*.5+.5
    return np.stack([np.clip(v*2.5,0,1), np.clip(v*1.2-.2,0,1), np.clip(v*.3,0,1)],-1)

def tex_snow(sz,seed):
    x,y=grid(sz,3); b=fbm(x*4,y*4,5,seed=seed)*.08
    sp=np.random.RandomState(seed+400).random((sz,sz))*.05
    v=.88+b+sp
    return np.stack([np.clip(v,.85,1), np.clip(v,.87,1), np.clip(v+.03,.9,1)],-1)

def tex_rust(sz,seed):
    x,y=grid(sz,5); b=fbm(x*3,y*3,5,seed=seed)*.6
    p=fbm(x*8+5,y*8+5,3,seed=seed+600)*.4
    v=np.clip(b+p+.3,.1,.8)
    return np.stack([np.clip(v*1.5,.2,.9), np.clip(v*.6,.05,.4), np.clip(v*.2,.02,.15)],-1)

def tex_ice(sz,seed):
    x,y=grid(sz,4); cr=fbm(x*10,y*10,5,seed=seed)
    b=fbm(x*2,y*2,3,seed=seed+700)*.3+.7
    cv=np.clip(np.abs(cr)*3,0,.3)
    return np.stack([np.clip(b-cv*.1,.6,1), np.clip(b-cv*.05,.7,1), np.clip(b+cv*.1,.75,1)],-1)

def tex_granite(sz,seed):
    x,y=grid(sz,6); n1=fbm(x*4,y*4,5,seed=seed)
    n2=fbm(x*8+3,y*8+3,4,seed=seed+800)
    sp=np.random.RandomState(seed+801).random((sz,sz))
    v=np.clip(n1*.5+n2*.3+.3,.2,.7)
    return np.clip(np.stack([v+sp*.1, v*.95+sp*.08, v*.9+sp*.12],-1),0,1)

def tex_cloud(sz,seed):
    x,y=grid(sz,2); b=fbm(x*3,y*3,6,seed=seed)
    d=fbm(x*8,y*8,4,seed=seed+900)*.3
    v=np.clip(b+d,-.5,1)*.5+.5
    sky=np.ones((sz,sz,3)); sky[...,0]=.5+y*.2; sky[...,1]=.6+y*.15; sky[...,2]=.9
    c=np.clip(v,0,1); c3=np.stack([c]*3,-1)
    return np.clip(sky*(1-c3*.8)+c3*.8,0,1)

def tex_fog(sz,seed):
    x,y=grid(sz,3); d=fbm(x*2,y*2,5,seed=seed)
    fl=fbm(x*1.5+10,y*1.5+10,3,seed=seed+1000)
    v=np.clip(d*.6+fl*.4+.3,.1,.9)
    return np.stack([v*.85+.1, v*.87+.1, v*.9+.1],-1)

def tex_watercolor(sz,seed):
    x,y=grid(sz,4); paper=fbm(x*15,y*15,3,seed=seed)*.1
    p1=fbm(x*2,y*2,4,seed=seed+1100)*.5+.5
    p2=fbm(x*3+5,y*3+5,3,seed=seed+1101)*.5+.5
    return np.stack([np.clip(p1+paper,.2,.9), np.clip(p2+paper,.3,.8),
                     np.clip((p1+p2)*.5+paper+.2,.4,.9)],-1)

def tex_halftone(sz,seed):
    x,y=grid(sz,16); p=fbm(x*2,y*2,3,seed=seed)*.5+.5
    cx=(x*4).round(); cy=(y*4).round()
    dots=((cx%2==0)&(cy%2==0)).astype(float)
    v=np.clip(p*.6+dots*.4+.2,0,1)
    return np.stack([v*.9+.05, v*.1+.02, v*.1+.05],-1)

def tex_toon(sz,seed):
    x,y=grid(sz,3); l=fbm(x,y,2,seed=seed)*.5+.5
    q=np.round(l*4)/4
    return np.clip(np.stack([q*.8+.15, q*.3+.1, q*.2+.1],-1),0,1)

def tex_voronoi(sz,seed):
    x,y=grid(sz,6); rng=np.random.RandomState(seed+1400)
    n_pts=30; px=rng.uniform(0,6,n_pts); py=rng.uniform(0,6,n_pts)
    md=np.full((sz,sz),1e10); sd=np.full((sz,sz),1e10)
    for i in range(n_pts):
        d=np.sqrt((x-px[i])**2+(y-py[i])**2); m=d<md
        sd=np.where(m,md,sd); md=np.minimum(md,d)
    edge=np.clip(sd-md,0,.3)/.3; v=md/md.max()
    return np.stack([np.clip(v*.6+edge*.4,0,1), np.clip(v*.4+edge*.3,0,1),
                     np.clip(v*.8+edge*.2,0,1)],-1)

def tex_neon_grid(sz,seed):
    x,y=grid(sz,20); gx=np.abs(np.sin(x*math.pi))**20
    gy=np.abs(np.sin(y*math.pi))**20; g=np.clip(gx+gy,0,1)
    bg=fbm(x*.5,y*.5,3,seed=seed)*.1
    return np.clip(np.stack([g*0+bg, g*.9+bg, g+bg],-1),0,1)

def tex_energy(sz,seed):
    x,y=grid(sz,4); cx,cy=2,2; d=np.sqrt((x-cx)**2+(y-cy)**2)
    ring=np.abs(np.sin(d*8-fbm(x,y,3,seed=seed)*2))**3
    hex_p=np.sin(x*10)*np.sin(y*10)*.2; v=np.clip(ring+hex_p,0,1)
    return np.clip(np.stack([v*.3, v*.8, v],-1),0,1)

def tex_mandelbrot(sz,seed):
    x=np.linspace(-2.5,1.0,sz); y=np.linspace(-1.25,1.25,sz)
    C=x[np.newaxis,:]+1j*y[:,np.newaxis]; Z=np.zeros_like(C)
    it=np.zeros((sz,sz),float)
    for i in range(50): m=np.abs(Z)<2; Z[m]=Z[m]**2+C[m]; it[m]+=1
    v=it/50
    return np.stack([np.clip(v*3,0,1), np.clip(v*1.5-.3,0,1), np.clip(v*2-.1,0,1)],-1)


PROC_TEXTURES = {
    "marble": (tex_marble, "procedural_materials", ["marble","stone","veined"]),
    "wood": (tex_wood, "procedural_materials", ["wood","grain","natural"]),
    "lava": (tex_lava, "procedural_materials", ["lava","fire","volcanic"]),
    "snow": (tex_snow, "procedural_materials", ["snow","white","winter"]),
    "rust": (tex_rust, "procedural_materials", ["rust","metal","corroded"]),
    "ice": (tex_ice, "procedural_materials", ["ice","frozen","cold"]),
    "granite": (tex_granite, "procedural_materials", ["granite","rock","speckled"]),
    "cloud": (tex_cloud, "volumetrics", ["cloud","sky","atmosphere"]),
    "fog": (tex_fog, "volumetrics", ["fog","mist","atmospheric"]),
    "watercolor": (tex_watercolor, "stylized_npr", ["watercolor","artistic","paint"]),
    "halftone": (tex_halftone, "stylized_npr", ["halftone","dots","comic"]),
    "toon": (tex_toon, "stylized_npr", ["toon","cel","anime"]),
    "voronoi": (tex_voronoi, "geometry_patterns", ["voronoi","cell","organic"]),
    "neon_grid": (tex_neon_grid, "sci_fi_abstract", ["neon","grid","cyberpunk"]),
    "energy_shield": (tex_energy, "sci_fi_abstract", ["shield","energy","hex"]),
    "mandelbrot": (tex_mandelbrot, "geometry_patterns", ["mandelbrot","fractal","math"]),
}

PROC_CAPTION_TPL = {
    "procedural_materials": [
        "Procedural {name} material, physically-based rendering",
        "Constitutional {name} texture for Mandala engine",
        "HIP assist validated {name} shader",
    ],
    "volumetrics": [
        "Volumetric {name} effect, atmospheric rendering",
        "Constitutional {name} volume shader",
        "RT4D validated {name} volumetric",
    ],
    "stylized_npr": [
        "Stylized {name} NPR shader, artistic rendering",
        "Constitutional {name} non-photorealistic texture",
        "Anime-style {name} shader",
    ],
    "geometry_patterns": [
        "Procedural {name} geometric pattern",
        "Mathematical {name} pattern, constitutional validation",
        "Deterministic {name} for Mandala rendering",
    ],
    "sci_fi_abstract": [
        "Sci-fi {name} shader, futuristic rendering",
        "Constitutional {name} effect with glow",
        "HIP assist {name} kernel",
    ],
}


def generate_procedural_textures() -> List[Dict]:
    """Generate procedural texture training images."""
    samples = []
    rng = np.random.RandomState(SEED)

    for name, (fn, category, tags) in PROC_TEXTURES.items():
        for v in range(3):  # 3 variations each
            s = SEED + hash(name) % 10000 + v * 137
            arr = fn(IMG_SIZE, s)
            arr = np.clip(arr * 255, 0, 255).astype(np.uint8)
            img = Image.fromarray(arr, "RGB")

            fname = f"proc_{name}_v{v}.png"
            img.save(IMG_DIR / fname, "PNG")

            # Pick caption template
            templates = PROC_CAPTION_TPL.get(category, PROC_CAPTION_TPL["procedural_materials"])
            t_idx = rng.randint(0, len(templates))
            caption = templates[t_idx].format(name=name)
            token = replay_token(caption + fname)

            samples.append({
                "image": fname,
                "caption": caption,
                "category": category,
                "tags": tags + ["procedural", "mandala", "constitutional"],
                "replay_token": token,
                "source": "procedural_library",
                "size": IMG_SIZE,
            })

    return samples


# ─── Main ───────────────────────────────────────────────────────────

def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Constitutional LoRA Training Dataset Builder")
    print("=" * 60)
    print()

    # Part 1: Anime images
    print("[1/2] Preparing anime images...")
    anime_samples = caption_anime_images()
    print(f"  -> {len(anime_samples)} anime images captioned and normalized")
    print()

    # Part 2: Procedural textures
    print("[2/2] Generating procedural textures...")
    proc_samples = generate_procedural_textures()
    print(f"  -> {len(proc_samples)} procedural textures generated")
    print()

    # Combine
    all_samples = anime_samples + proc_samples
    random.seed(SEED)
    random.shuffle(all_samples)

    # Split
    split = int(len(all_samples) * 0.9)
    train = all_samples[:split]
    val = all_samples[split:]

    # Write JSONL files
    for fname, data in [("captions.jsonl", all_samples),
                        ("train.jsonl", train),
                        ("val.jsonl", val)]:
        path = OUTPUT / fname
        with open(path, "w", encoding="utf-8") as f:
            for s in data:
                f.write(json.dumps(s) + "\n")
        print(f"  {fname}: {len(data)} samples")

    # Stats
    print()
    print(f"Total images: {len(all_samples)}")
    print(f"  Anime: {len(anime_samples)}")
    print(f"  Procedural: {len(proc_samples)}")
    print(f"  Train: {len(train)} | Val: {len(val)}")
    print()

    cats = {}
    for s in all_samples:
        cats[s["category"]] = cats.get(s["category"], 0) + 1
    print("Category distribution:")
    for c, n in sorted(cats.items()):
        print(f"  {c}: {n}")

    print()
    print(f"Dataset ready at: {OUTPUT}")


if __name__ == "__main__":
    main()
