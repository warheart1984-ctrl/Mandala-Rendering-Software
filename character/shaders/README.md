# shaders — fur, skin, metal, fabric

**Status:** **partial** — contracts are real (JSON + WGSL). Beauty execution is a CPU Lambert/Blinn stand-in, not a GPU path tracer.

## Purpose

First-class materials for Stage 3. Do not bury shaders inside a one-off render script.

## Inputs

Mesh regions from `../models` (`skin`, `fur`, `metal`, `leather`, `fabric`).

## Outputs / files

| File | Material |
|------|----------|
| `skin.json` + `skin.wgsl` | Skin (SSS declared, wrap Lambert stand-in) |
| `fur.json` + `fur.wgsl` | Anisotropic / layered fur |
| `metal.json` + `metal.wgsl` | Conductor specular / reflection |
| `leather.json` + `fabric.wgsl` | Roughness + grain |
| `fabric.json` + `fabric.wgsl` | Cape / cloth |

GLB PBR factors are copied from these JSON files into `char_final.glb`.

## Simulation Chamber

Shaders stay Mandala (pixels). Chamber consumes rig/motion, not these WGSL files, until a shared material adapter exists.
