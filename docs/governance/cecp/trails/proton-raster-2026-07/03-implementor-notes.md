# 03 — Implementor notes (six-mod CECP reference)

**Trail:** `proton-raster-2026-07`  
**Stage:** Implementor  
**Predecessor:** `02-builder-scaffold-manifest.md`  
**Date:** 2026-07-27

## Intent fulfilled

Shipped runnable CPU MVP for all six CECP mods + PNG export, with per-mod tests
and end-to-end hash stability. Scene input = SceneSpecification.

## Files touched

- `mrs/packages/renderer-core/src/render/rt4d/proton/sceneToProtonField.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/projectProtonField.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/rasterizeProtons.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/depthField.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/normalField.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/lighting4d.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/rasterToImage.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/pipeline.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/mods.six.test.js`
- `mrs/packages/renderer-core/src/render/rt4d/proton/index.js`
- `mrs/packages/renderer-core/scripts/render-proton-splat.mjs`
- `mrs/adapters/proton-raster-bridge/CONTRACT.md`
- Trail `01`–`03` + README

## Per-module notes

| Mod | Design | Scaffold | Tests | Notes |
|-----|--------|----------|-------|-------|
| 1 Scene→ProtonField | Proton{id,center,radius,density,color,metadata}; ≥1/entity | file | Mod1 suite | fallback proton for empty geom |
| 2 Projection | Camera4D origin+basis4×3+params; dropped[] | file | Mod2 | no silent loss |
| 3 Raster | gaussian soft splat id-sorted | file | Mod3 | intentId gate |
| 4 Depth | weighted avg; ≥0 | file | Mod4 | |
| 5 Normal | weighted avg; unit/zero; no NaN | file | Mod5 | |
| 6 Lighting4D | 1/(1+k r²) falloff | file | Mod6 | |

## Test inventory

| Suite | Result |
|-------|--------|
| `mods.six.test.js` | pass (9 asserts / 7 describes) |
| `registry.test.js` + `softSplat.test.js` (legacy) | pass |
| **Total proton/** | **24 pass / 0 fail** |

## Commands

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/proton/*.test.js
node mrs/packages/renderer-core/scripts/render-proton-splat.mjs --demo --width 64 --height 64 --output output/proton-cecp-demo.png
```

## Status tag updates

Six mods + PNG + CLI: **enforced**. Genblaze: **partial**. Roadmap list: **declared**.

## Handoff to Reviewer

Verify CIR thinness, no ungoverned raster, StoryForge ban, Drive-G-1 tags, protected paths untouched.
