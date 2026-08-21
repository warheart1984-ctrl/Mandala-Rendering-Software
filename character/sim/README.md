# sim — cloth / hair / body simulation

**Status:** **partial** — CPU stand-in. Not Blender cloth, not Houdini hair, **not RHFD ∇V / Möbius petal physics**.

## Purpose

Run simulation on the **rigged** mesh from **frame 0**, including wireframe renders.

## Inputs

| Input | Path |
|-------|------|
| Rigged mesh | `../models/exports/char_rigged.glb` (logical; pipeline uses in-memory mesh) |
| Hooks | `hooks.json` |
| Preset | `presets/wire_sim.json` or `presets/beauty_sim.json` |

## Outputs

Displaced positions + energy/hair curves fed into `../renders` and baked into Stage 1 / Stage 3 GLBs.

## Vertex groups / collision

- `cloth_cape` — cape verts
- `hair_scalp` / `fur_cards` — hair
- Collision volumes: hips, shoulders, chest (named extras; not a physics engine)

## Presets

| id | Meaning |
|----|---------|
| `wire_sim` | Wires + sim motion |
| `beauty_sim` | Full materials + sim motion |

## Simulation Chamber

Motion organ. This module prepares sim-ready hooks on `char_rigged.glb`. Chamber `--character-glb` is the consume path; full cloth inside Chamber is not implemented.
