# Proton Raster Bridge Contract (CECP Ω∞ six-mod reference)

> **Status:** Six CPU mods + PNG pipeline are **enforced** by
> `mods.six.test.js` + CLI. Genblaze HTTP host remains **partial**
> (provider stub, unwired). Roadmap mods are **declared** only.
> Drive-G-1: soft splat ≠ PathTracer ≠ Engine3D triangle soft-raster.

## Purpose

Second CECP reference package (peer to Prompt→Scene):

```text
SceneSpecification
  → Scene→ProtonField
  → ProtonField→Lighting4D
  → ProtonField→4DProjection
  → ProjectedProtonField→ProtonRaster
  → ProtonRaster→DepthField
  → ProtonRaster→NormalField
  → ProtonRaster→Image (PNG)
```

CIR = thin IntentRecord overlay (`intentId` required before raster).

## SoT

`mrs/packages/renderer-core/src/render/rt4d/proton/`

CLI: `mrs/packages/renderer-core/scripts/render-proton-splat.mjs`

## Status tags

| Artifact | Tag |
|----------|-----|
| Six mods + pipeline + tests | **enforced** |
| CIR mint + CLI | **enforced** |
| Genblaze provider | **partial** (disabled) |
| MaterialMap4D, SpatialLayout4D, ForceField4D, ProtonDynamics, SemanticTagging, ToneMap, Scene→Camera4D | **declared** |
| Anisotropic Σ / GPU splat | **declared** |

## Ban

No `story_forge` / `storyforge` under Genblaze `app/*.py`.

## CECP

Trail: `docs/governance/cecp/trails/proton-raster-2026-07/`
