# Temporal 4D Chamber Path (partial)

> We don't just render space. We render space through time.

Simulation Chamber path that demonstrates **temporal extrusion + hyperplane slice**, plus an **infographic-style multi-instance composite** (heart-sequence layout). Soft-raster only.

## Run

```bash
node scripts/simulation-chamber-temporal.mjs scene-temporal-4d \
  --out output/simulation/temporal-4d-demo

# or via main chamber CLI:
node scripts/simulation-chamber.mjs scene-temporal-4d --temporal
```

FX-8350 defaults: sequence 320×240 × 8 frames; composite 480×256 × 5 phase instances.

## Outputs

| Path | Contents |
|------|----------|
| `output/simulation/temporal-4d-demo/composite.png` | **Primary** — t0…t4 in one image, cyan→orange, insight callout |
| `output/simulation/temporal-4d-demo/composite-energy-wire.png` | Partial energy-wire bloom style (not full Mythar holo COMPOSITE) |
| `output/simulation/temporal-4d-demo/frames/*.png` | Soft-raster slice sequence |
| `output/simulation/temporal-4d-demo/frames/*.bin` | Companion xyz packs (simplified) |
| `output/simulation/temporal-4d-demo/composite-sequence.mp4` | Optional short scrub (if ffmpeg present) |
| `output/simulation/temporal-4d-demo/watch.html` | Composite / energy-wire / sequence viewer |
| `output/simulation/temporal-4d-demo/receipt.json` | Honest status + disclaimer |
| `output/simulation/temporal-4d-demo/README.md` | Local copy of claim |

Serve: `python3 -m http.server 8766` from the out dir → `http://127.0.0.1:8766/watch.html`

## Before / after

| | |
|---|---|
| **Before** (prior step) | Sequence-only: one hyperplane slice `M(w)` per PNG. Timeline strip hint only — **no** multi-instance temporal smear in one frame. |
| **After** (this step) | `composite.png` places phases **t0…t4** spatially with cyan→orange coloring; late-cycle narrowing marked **insight!**; watch defaults to composite. |

## Status

| Item | Tag | Notes |
|------|-----|-------|
| Chamber temporal path | **partial** | Working demo |
| Infographic multi-instance composite | **partial** | Soft-raster smear in one frame |
| Energy-wire composite style | **partial** | Bloom wires on organ mesh — not EGT COMPOSITE |
| `extrudeBetween` / `sliceExtrudedAtW` | **partial** | Matching topology |
| Soft-raster | **partial** | Not RT4D / PBR |
| Mythar holographic look | **declared** | Out of this path |
| Remeshing | **declared** | Non-matching meshes |
| Clinical / medical imaging | **declared** | Out of scope — not a device |

## Gaps remaining

- Not Mythar / chamber holo COMPOSITE appearance (energy-wire here is soft-raster only)
- Not clinical / diagnostic imaging
- Remeshing for non-matching topology still declared
- Overlapping true 4D volume rendering (transparent motion solid) not implemented — spatial layout is the infographic stand-in

## Disclaimer

Not a medical device. Not photoreal. Temporal insight via slice of an abstract motion solid + multi-instance infographic composite only.
