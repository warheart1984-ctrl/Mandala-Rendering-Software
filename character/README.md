# Character production pipeline

**Status:** Stage 1 **working** (procedural). Stage 2/3 **partial**. Blender/ZBrush **blocked-with-evidence**.

This is a first-class Mandala + Simulation Chamber + tools module. It is **not** a new organ and **not** a third character system.

Chosen path (top-level `/models` would collide with `runtime/models/` and other nested `models/` trees):

```
character/
  models/       sculpt + retopo + rig
  sim/          cloth / hair / body simulation
  shaders/      fur, skin, metal, fabric
  renders/      wireframe, rig view, final
  tools/        export / import (GLB, FBX stub)
  holography/   skin EGT / muscle / face / body (partial; imports mandala/holography)
```

Holography docs: [`docs/mandala/CHARACTER_HOLOGRAPHY.md`](../docs/mandala/CHARACTER_HOLOGRAPHY.md). Demo: `node character/holography/demo.mjs`.

## Organs

| Organ | Role here |
|-------|-----------|
| **Mandala** | Pixels — stills and beauty stand-in |
| **Simulation Chamber** | Motion — consume `char_rigged.glb` |
| **tools** | Export/import CLI |
| Story Forge / AI Painter / Mythar / AAIS / Movie Lane | Out of scope |

Existing capsule humanoids stay in `scripts/humanoid-avatar.mjs`. Simulation Chamber v3 (`scripts/simulation-chamber.mjs`) logs this hook and accepts `--character-glb`. It still **renders** 15-part RT4D primitives until a mesh adapter lands. Do not duplicate a third body.

**RHFD / Möbius:** meshes and Chamber capsules are **defects** (petal ruptures) in the Mandala substrate, not a second universe. Mapping: `mandala/substrate/MAPPING.md`. Chamber motion is still pose interpolation (**partial**), not ∇V.

## One asset, three views

Not three characters. One source (`models/source/default-humanoid.json`) drives:

```
                    ┌─────────────────────────┐
                    │  default-humanoid.json  │
                    │     (one character)     │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        Stage 1 Wire      Stage 2 Rigged     Stage 3 Final
        topology+energy    mesh+armature      materials+light
              │                 │                 │
              ▼                 ▼                 ▼
      char_wire.glb      char_rigged.glb    char_final.glb
      char_wire_render   char_rig_view      char_final.png
      .png               .png               (+ char_final.mp4)
```

### Stage contracts (always export)

| Stage | Goal | Always export |
|-------|------|----------------|
| **1 Wire / energy body** | Clean topology (quads/loops), wire overlay, energy lines | `char_wire.glb`, `char_wire_render.png` |
| **2 Rigged / sim-ready** | Weights, sim hooks (spine, shoulders, hips, tail, fingers), collision volumes | `char_rigged.glb`, `char_rig_view.png` |
| **3 Final** | Fur / leather / metal, key+fill+rim, posed + sim | `char_final.glb`, `char_final.png`, optional `char_final.mp4` |

Wireframe materials: pass A = pure wireframe; pass B = wire + glowing energy curves. Composited into `char_wire_render.png`. Energy also lives in the GLB as a `LINES` primitive.

## Sim from frame 0

Always run sim on the rigged mesh, **including wireframe renders**.

| Preset | File | Meaning |
|--------|------|---------|
| `wire_sim` | `sim/presets/wire_sim.json` | Wires + sim motion |
| `beauty_sim` | `sim/presets/beauty_sim.json` | Full materials + sim motion |

CPU stand-in (not Blender cloth). Honest **partial**.

## Simulation Chamber hook

Plug-in point: **`character/models/exports/char_rigged.glb`**

```bash
node character/tools/export-character.mjs
node scripts/simulation-chamber.mjs scripts/scene-cards/SOME.json --character-glb
```

Hook module: `character/tools/simulation-chamber-hook.mjs`.

## How to run

```bash
node character/cli.mjs build --id char --species anthro --out character/renders/char
node character/cli.mjs build --id aven --species human --out character/renders/aven --turntable
node --test character/test/pipeline.test.mjs
node character/tools/export-character.mjs
```

Outputs land under `character/models/exports/` and `character/renders/`.

## Honest status

| Piece | Tag | Evidence |
|-------|-----|----------|
| Stage 1 GLB + PNG | **working** | CLI writes both files |
| Quad topology | **partial** | Tube quads + UV-sphere; head poles are tris |
| Skinning | **partial** | JOINTS_0 / WEIGHTS_0 nearest-bone; not DCC-painted |
| Cloth / hair sim | **partial** | Procedural displacement from frame 0 |
| Beauty shaders | **partial** | JSON + WGSL contracts; CPU Lambert/Blinn stand-in |
| Turntable MP4 | **partial** | 8 CPU frames + local ffmpeg when present |
| Blender CLI | **blocked-with-evidence** | `blender` not on PATH |
| ZBrush sculpt | **blocked-with-evidence** | Not available; procedural mesh instead |
| FBX | **skeleton** | `tools/fbx-export.mjs` sidecar only |
| Chamber mesh consume | **partial** | Path logged; RT4D still uses capsules |

## Constraints honored

- No constitution / AGENTS.md edits
- Small procedural mesh (CPU, ~1k verts), 128×128 stills by default
- FFmpeg: `runtime/toolchain/ffmpeg/usr/bin/ffmpeg`
- Does not touch `scripts/scene-cards/` novel scenes or `output/simulation/` salt-map outputs
