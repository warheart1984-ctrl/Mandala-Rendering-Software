# models — sculpt + retopo + rig

**Status:** **partial** (procedural). Sculpt/retopo DCC: **blocked-with-evidence**.

## Purpose

Author the **one** character asset: rest mesh, animation-ready topology, armature, weights.

## Inputs

| Input | Path | Notes |
|-------|------|-------|
| Character source | `source/default-humanoid.json` | Proportions aligned with `scripts/humanoid-avatar.mjs` |
| Optional sculpt | `source/sculpt.obj` | Not present. ZBrush/GoZ not available on this host |

## Outputs

| File | Stage |
|------|--------|
| `exports/char_wire.glb` | Stage 1 |
| `exports/char_rigged.glb` | Stage 2 (Simulation Chamber plug-in) |
| `exports/char_final.glb` | Stage 3 |
| `exports/char_rigged.fbx.json` | FBX stub sidecar |

## Topology

Procedural quad tubes (8-sided loops along limbs) + UV-sphere head. Head poles are triangles — honest **partial**, not a ZBrush / Blender retopo.

Bones: Root, Hips, Spine, Chest, Neck, Head, shoulders, arms, hands, fingers, legs, feet, Tail.

Weights: nearest-bone along each limb (`JOINTS_0` / `WEIGHTS_0`). **partial**, not painted.

## Simulation Chamber

Chamber should consume **`exports/char_rigged.glb`**, not a second mesh. See `../tools/simulation-chamber-hook.mjs`.
