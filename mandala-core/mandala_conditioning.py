"""
mandala_conditioning.py — Mandala G-buffer → DiT conditioning adapter.

Reads PrimitiveRef JSON (from mandala_rt4d_bridge or SD bridge),
loads depth/normal/material PNG maps, packs them into conditioning
tensors [T, C, H, W], and exports as .npy for the DiT training loop.

Usage:
    python mandala_conditioning.py --prim primitive_ref.json --out conditioning.pt
"""

import json
import struct
import sys
import os
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

# Conditioning channel layout (matches mandala-core conditioning/mod.rs):
#   depth:   1 channel
#   normals: 3 channels (X, Y, Z)
#   motion:  2 channels (dX, dY)
#   materials: 4 channels (roughness, metalness, specular, subsurface)
#   lighting:  2 channels (intensity, direction_encoded)
#   objects: 8 channels (one-hot mask classes)
# Total: 20 channels

TOTAL_CHANNELS = 20
DEPTH_CH = 1
NORMAL_CH = 3
MOTION_CH = 2
MATERIAL_CH = 4
LIGHTING_CH = 2
OBJECT_CH = 8


def load_png_as_float(path: str, target_shape: Optional[Tuple[int, int]] = None) -> np.ndarray:
    """Load a PNG as float32 array [H, W] or [H, W, C]."""
    try:
        from PIL import Image
        img = Image.open(path).convert("RGB")
        arr = np.array(img, dtype=np.float32) / 255.0
        if target_shape and (arr.shape[0] != target_shape[0] or arr.shape[1] != target_shape[1]):
            from PIL import Image as PILImage
            img = img.resize((target_shape[1], target_shape[0]), PILImage.BILINEAR)
            arr = np.array(img, dtype=np.float32) / 255.0
        return arr
    except ImportError:
        # Fallback: create synthetic conditioning if PIL not available
        h, w = target_shape or (64, 64)
        return np.random.rand(h, w, 3).astype(np.float32) * 0.5 + 0.25


def load_depth(path: str, h: int, w: int) -> np.ndarray:
    """Load depth map as [H, W, 1]."""
    img = load_png_as_float(path, (h, w))
    if img.ndim == 3:
        img = img[:, :, 0]  # Take first channel
    return img[:, :, np.newaxis]  # [H, W, 1]


def load_normals(path: str, h: int, w: int) -> np.ndarray:
    """Load normal map as [H, W, 3], remap from [0,1] to [-1,1]."""
    img = load_png_as_float(path, (h, w))
    return img[:, :, :3] * 2.0 - 1.0  # [H, W, 3]


def compute_motion_vectors(depth: np.ndarray, prev_depth: Optional[np.ndarray] = None) -> np.ndarray:
    """Compute simple motion vectors from depth difference (placeholder for real optical flow)."""
    h, w, _ = depth.shape
    if prev_depth is None:
        return np.zeros((h, w, 2), dtype=np.float32)
    dx = depth[:, :, 0] - prev_depth[:, :, 0]
    dy = np.zeros_like(dx)
    return np.stack([dx, dy], axis=-1).astype(np.float32)


def generate_material_hints(primitive_ref: dict, h: int, w: int) -> np.ndarray:
    """Generate material hint channels from PrimitiveRef material params."""
    mat = primitive_ref.get("material", {})
    params = mat.get("params", {})
    roughness = params.get("roughness", 0.5)
    metallic = params.get("metallic", 0.0)
    specular = params.get("specular", 0.5)
    subsurface = params.get("subsurface", 0.0)
    buf = np.zeros((h, w, 4), dtype=np.float32)
    buf[:, :, 0] = roughness
    buf[:, :, 1] = metallic
    buf[:, :, 2] = specular
    buf[:, :, 3] = subsurface
    return buf


def generate_lighting_hints(primitive_ref: dict, h: int, w: int) -> np.ndarray:
    """Generate lighting hint channels from PrimitiveRef render params."""
    render = primitive_ref.get("render", {})
    spp = render.get("spp", 2)
    intensity = min(1.0, spp / 8.0)
    buf = np.zeros((h, w, 2), dtype=np.float32)
    buf[:, :, 0] = intensity
    buf[:, :, 1] = 0.0  # direction encoded (placeholder)
    return buf


def generate_object_masks(primitive_ref: dict, h: int, w: int, num_classes: int = 8) -> np.ndarray:
    """Generate soft object mask channels (placeholder — real masks come from segmentation)."""
    buf = np.zeros((h, w, num_classes), dtype=np.float32)
    buf[:, :, 0] = 1.0  # Background class
    return buf


def pack_gbuffer(depth: np.ndarray, normals: np.ndarray, motion: np.ndarray,
                 materials: np.ndarray, lighting: np.ndarray, objects: np.ndarray) -> np.ndarray:
    """Pack all conditioning channels into [H, W, C] tensor."""
    return np.concatenate([depth, normals, motion, materials, lighting, objects], axis=-1)


def primitive_ref_to_conditioning(prim: dict, h: int = 64, w: int = 64) -> np.ndarray:
    """
    Convert a PrimitiveRef JSON to a conditioning tensor [1, C, H, W].
    This is the main entry point for the SD bridge → DiT pipeline.
    """
    # Load asset paths if available
    assets = prim.get("assets", {})
    depth_path = assets.get("depth")
    normal_path = assets.get("normal")

    if depth_path and os.path.exists(depth_path):
        depth = load_depth(depth_path, h, w)
    else:
        depth = np.random.rand(h, w, 1).astype(np.float32) * 0.3 + 0.1

    if normal_path and os.path.exists(normal_path):
        normals = load_normals(normal_path, h, w)
    else:
        normals = np.random.rand(h, w, 3).astype(np.float32) * 2.0 - 1.0

    motion = compute_motion_vectors(depth)
    materials = generate_material_hints(prim, h, w)
    lighting = generate_lighting_hints(prim, h, w)
    objects = generate_object_masks(prim, h, w)

    gbuf = pack_gbuffer(depth, normals, motion, materials, lighting, objects)

    # Transpose to [C, H, W] and add batch dim → [1, C, H, W]
    tensor = gbuf.transpose(2, 0, 1)[np.newaxis, ...]
    return tensor.astype(np.float32)


def export_numpy(tensor: np.ndarray, path: str):
    """Export conditioning tensor as .npy file."""
    np.save(path, tensor)
    print(f"Exported conditioning tensor {tensor.shape} → {path}")


def export_raw_binary(tensor: np.ndarray, path: str):
    """Export conditioning tensor as raw f32 binary."""
    with open(path, "wb") as f:
        f.write(struct.pack("<IIII", *tensor.shape))
        f.write(tensor.tobytes())
    print(f"Exported raw binary {tensor.shape} → {path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Mandala G-buffer → DiT conditioning adapter")
    parser.add_argument("--prim", required=True, help="Path to primitive_ref.json")
    parser.add_argument("--out", default="conditioning.npy", help="Output .npy path")
    parser.add_argument("--height", type=int, default=64, help="Latent height (default: 64)")
    parser.add_argument("--width", type=int, default=64, help="Latent width (default: 64)")
    parser.add_argument("--raw", action="store_true", help="Export raw binary instead of .npy")
    args = parser.parse_args()

    with open(args.prim, "r", encoding="utf-8") as f:
        prim = json.load(f)

    tensor = primitive_ref_to_conditioning(prim, h=args.height, w=args.width)

    if args.raw:
        export_raw_binary(tensor, args.out)
    else:
        export_numpy(tensor, args.out)

    # Print constitution summary
    cons = prim.get("constitutional", {})
    print(f"  Constitutional: gpu_assist_only={cons.get('gpu_assist_only', False)}, "
          f"replayable={cons.get('replayable', False)}")
    print(f"  Channels: depth={DEPTH_CH} normals={NORMAL_CH} motion={MOTION_CH} "
          f"materials={MATERIAL_CH} lighting={LIGHTING_CH} objects={OBJECT_CH}")
    print(f"  Total: {TOTAL_CHANNELS} channels, shape [1, {TOTAL_CHANNELS}, {args.height}, {args.width}]")


if __name__ == "__main__":
    main()
