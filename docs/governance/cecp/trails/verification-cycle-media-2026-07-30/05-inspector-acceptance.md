# 05 — Inspector acceptance

| Field | Value |
|-------|-------|
| Role | Inspector + Testwright |
| Date | 2026-07-30 |
| InspectorVerdict | **PASS_WITH_GAPS** |

## Probe matrix

| # | Probe | Result | Evidence |
|---|-------|--------|----------|
| 1 | CCC image-gen (default) | PASS | `fallbackUsed:true`, `blockedOnGpu:false`, `pixelsProduced:false` |
| 2 | CCC `--force-gpu-down` | PASS | selects `local.cpu`; not architecture-blocked |
| 3 | CCC `--try-generate` | PASS_WITH_GAPS | degraded; Lemonade no pixels |
| 4 | SX legacy still auto | PASS | OpenCL 512×512 PNG; lemonadeOk false |
| 5 | Engine3D VII proof still | PASS | cycle still 960×540 soft-raster |
| 6 | Engine3D 2s clip | PASS | 2.0s 1920×1080@12fps H.264 |
| 7 | Showcase inventory | PASS | showcase-30s / cinematic-v2 / vii-rerun on disk + ffprobe |
| 8 | ImageGenProvider unit | PASS | 11/11 |

## Visual inspection (stills)

| File | Look |
|------|------|
| Cycle Engine3D still | Dark dim-room soft-raster: blocky chairs, white emissive monitor, yellow ceiling bars, grain/DOF — **not photoreal** |
| Prior cinematic-v2 still | Same soft-raster language; slightly heavier file |
| OpenCL Tonga | Soft radial coral→plum glow — beauty **probe**, not Mandala scene |

## Gaps

- Lemonade CCC pixels deferred
- showcase vii-rerun / this-cycle clips are 2s proof (full 10s/30s remain prior cinematic-v2)

## Handoff → ESFR

Accept verification package with gaps; do not promote Lemonade as working beauty source.
