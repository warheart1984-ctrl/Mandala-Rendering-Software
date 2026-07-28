# 03 — Implementor notes

**Trail:** `cinematic-render-quality-2026-07`  
**Stage:** Implementor  
**softwareCreationMode:** Optimizer + Constructor  
**mode:** Artisan + Render-Physicist  
**Depends on:** 01, 02

## Attack-list mapping (user priority)

| Priority | Shipped | Tag |
|----------|---------|-----|
| 1 Noise | spp floor 16; stratified AA; adaptive early-stop; firefly clamp | **enforced** (tests) |
| 2 Lighting | power-weighted NEE pick; dual key+fill; larger radii | **enforced** / soft penumbra **declared** |
| 3 Materials | Engine3D shadeRasterFragment already; RT4D lambertian unchanged | **partial** |
| 4 AA | stratified jitter2d in render-scene | **enforced** |
| 5 Color | aces-lite via qualityOpts (cinematic); reinhard default | **enforced** |

## Evidence

- 512²×32 spp timed out @ 600s → floor 16 + adaptive.  
- `node --test scripts/test/scene-quality.test.js scripts/test/render-scene.test.js` → 11 pass.  
- `pytest test_pipeline.py` → cinematic floors + draft clamp.

## Honest gaps

- Soft contact shadows: larger lights only (no multi-tap penumbra).  
- Engine3D fixture primitives not fully expanded by still CLI.  
- Indirect GI still path-length limited by maxDepth=6.
