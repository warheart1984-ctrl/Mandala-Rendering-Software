# ProjCC Integration Notes

| Field | Value |
| --- | --- |
| Status | **partial→enforced** (kernel / presets / aperture / bind suite); charter CKL **declared** |
| Contract | [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md) |
| Package | `mrs/packages/renderer-core/src/render/rt4d/projection/` |
| Math / print SoT | **`output/projector.js` (Projector4D)** + CPU RT4D still/print — unchanged |
| Observation layer | ProjectionKernel / ApertureFrame3D — **assist/preview only** |

> **BANNER:** Governed observation aperture — assist/preview only; CPU RT4D print
> remains SoT. Aperture ≠ print. Never route aperture into Digital Printer /
> beauty-print pipelines. ProjectionKernel is a continuity layer on Projector4D,
> not a second SoT.

## What is wired (**enforced** where `test:projection` proves)

| Surface | Evidence |
| --- | --- |
| `ProjectionState` / `ProjectionKernel` | continuity + kernel strength + fidelity |
| Continuous \(P(\theta,\varphi,\tau,\kappa)\) | `continuityMath.js` aligned with `d4/(d4+w)`, `d3/(d3+z)` |
| Observation presets (incl. orbit / soft_caustic) | resolve + screen-delta + undefined-clobber regression |
| `ApertureFrame3D` | `printSoT:false` / `authority:"observation"` metadata tests |
| PathTracer4D `observationProjection` bind | `bindPathTracerProjection` + unit/integration |
| Hyper-Caustic north-star | energy / caustic / temporal tolerance sweeps (no soft-skip) |
| Package-local projection governance | deny without PCC metadata; attachProvenance |

## What remains **declared** / irreducible

| Surface | Note |
| --- | --- |
| Charter `default.policies.json` ProjCC row | Protected; package filter is partial stand-in |
| Full continuous primary-ray rewrite through every bounce | Bind exists; not a full integrator rewrite |
| GPU-accelerated continuous projection | Vendor assist only |
| Pixel-hash gallery FULL_PASS vs frozen PNG | Optional hash path; sweeps are tolerance-based |
| Runtime “observation engine production ready” | Not claimed (Drive-G-2) |

## npm scripts

From `mrs/packages/renderer-core`:

```bash
pnpm run test:projection
```

## CECP trail

`docs/governance/cecp/trails/pcc-projection-2026-07/`

## Anime structure plate (separate lane)

Structure-lane plate projection (Engine3D soft-raster / ink-cel consumer) is **not** ProjCC aperture and **not** Print SoT. See:

- [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) — **declared / partial**
- [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md)
- [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md)
- Runner: `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs` → `tmp/rt4d-project-compare/`
