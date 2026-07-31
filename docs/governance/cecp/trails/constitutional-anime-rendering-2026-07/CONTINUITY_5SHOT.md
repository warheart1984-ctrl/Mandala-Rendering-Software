# Continuity 5-Shot Demo — Delivery Note

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `artifact` | Governed 5-shot continuity cycle |
| `status` | **partial** (plates + dual-run **enforced** this cycle) |
| `date` | 2026-07-31 |

## Product story proven

Same two named characters (`char.kael`, `char.mira`) across five shots;
exactly three camera angles; changing lighting presets; one 4D-portal
transform (`shot-04`); complete replayable evidence chain with frozen
parameters and dual-run beauty sha256 equality.

## Durable paths

| Path | Role |
|------|------|
| `schemas/anime/examples/continuity-5shot.shot-plan.json` | Shot plan |
| `schemas/anime/ContinuityShotEvidence.v1.schema.json` | Evidence schema |
| `mrs/packages/engine3d-core/scripts/run-anime-continuity-5shot.mjs` | Runner |
| `mrs/packages/engine3d-core/scripts/README-anime-continuity-5shot.md` | Re-run pointer |
| `tmp/constitutional-anime-continuity-5shot/` | Local outputs (gitignored) |

## Re-run

```bash
cd mrs/packages/engine3d-core
npm run render:anime-continuity-5shot -- --out-dir ../../../tmp/constitutional-anime-continuity-5shot
```

## Status honesty

| Concern | Tag |
|---------|-----|
| Soft-raster continuity plates | **partial** |
| Dual-run frozen-param replay (this cycle) | **enforced** |
| AnimeWorldProfile CKL shot gate | **declared** |
| Ink-cel InkOptions binding | **declared** (cel/ink post proxy used) |
| RT4D path-trace portal | **partial** proxy (emissive tesseract soft-raster) |
| Lemonade SD beauty | **blocked** / unused |
| Photoreal | **non-claim** |
