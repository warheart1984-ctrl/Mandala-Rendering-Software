# renders — wireframe, rig view, final

**Status:** Stage 1 PNG **working**. Stage 2/3 PNG **partial** (CPU raster, not RT4D/Cycles).

## Purpose

Still and optional turntable outputs for the three views of **one** character.

## Inputs

In-memory posed + sim mesh from `../tools/export-character.mjs`.

## Outputs (always)

| File | View |
|------|------|
| `char_wire_render.png` | Topology wire + energy (pass A + pass B composite) |
| `char_rig_view.png` | Mesh + rig overlay |
| `char_final.png` | Shaded / lit / posed |
| `char_final.mp4` | Optional 8-frame turntable |
| `export-receipt.md` | Hashes, status tags, paths |

Default resolution: 128×128 (CPU-bound FX-8350 / 15GB RAM). RT4D is not used here so we do not need 64×64/1spp; the raster is cheap. A 64×64 path is available via `--width 64 --height 64`.

## Simulation Chamber

Chamber writes its own frames under `output/simulation/` (do not overwrite). These stills are Mandala previews of the pipeline asset, not Chamber recordings.
