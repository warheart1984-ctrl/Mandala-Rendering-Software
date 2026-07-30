# 03 — Implementor notes

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Implementor (CECP 03)  
**mode:** Constructor + Debugger + Runtime-Sage

## Intent fulfilled

Shipped concrete Gap 1–3 implementations with tests and proof artifacts. No protected charter edits.

## Files touched

| Path | Change |
|------|--------|
| `mrs/packages/engine3d-core/src/renderer/raster/ShaderBridge.ts` | new — constitutional→PBR bridge |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` | `applyAcesApproxToneMap` |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterMaterial.ts` | docs: bridge entry path |
| `mrs/packages/engine3d-core/src/face/FixtureFaceRegistry.ts` | new — evidence + AABB |
| `mrs/packages/engine3d-core/src/face/index.ts` | exports |
| `mrs/packages/engine3d-core/src/index.ts` | exports |
| `mrs/packages/engine3d-core/test/renderer/shader-bridge.test.ts` | new |
| `mrs/packages/engine3d-core/test/face/fixture-registry.test.ts` | new |
| `mrs/packages/engine3d-core/package.json` | test scripts |
| `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js` | provenance + haltCauseClass |
| `sovereign-x/tests/lemonadeSdAdapter.test.js` | extended |
| `docs/4d-engine/proofs/sx-arch-gaps-2026-07/**` | proofs |

## Unit / integration tests

| Suite | Result |
|-------|--------|
| `npm run test:shader-bridge` | **6/6 PASS** |
| `npm run test:fixture-registry` | **4/4 PASS** |
| `node --test sovereign-x/tests/lemonadeSdAdapter.test.js` | **5/5 PASS** |

## Live Lemonade probe (2026-07-30)

| Field | Evidence |
|-------|----------|
| Server | up `:13305` |
| Catalog downloaded | SD-Turbo, SD-Turbo-GGUF, SDXL-*, RealESRGAN |
| Weight search roots | no files found → `WEIGHT_MISSING` (gate incomplete, not hard-deny on mismatch) |
| `images/generations` | HTTP fail `model_load_error`: **sd-server failed to start or become ready** |
| `haltCauseClass` | **`sd_server`** (not `provenance`) |

Proof: `docs/4d-engine/proofs/sx-arch-gaps-2026-07/lemonade-halt-cause-summary.json`

## Status tag updates

| Component | Tag |
|-----------|-----|
| ShaderBridge | **partial** |
| ACES-approx tone-map | **partial** |
| Soft-raster photoreal | **not claimed** |
| Lemonade weight provenance gate | **partial** |
| Lemonade SD generate (this host) | **blocked** (`sd_server`) |
| Fixture face registry / AABB | **partial** (HumanFaceRigged lawful) |

## Remaining gaps

- Soft-raster still ≠ Cycles/RTX; bridge does not claim photoreal.
- Lemonade weight files not located under default cache roots (catalog vs filesystem path gap).
- SD remains blocked by sd-server on this host after provenance layer added.
- Fixture “signature” is evidence/contentHash only — no PKI.

## Handoff to Reviewer

Review Drive-G-1 honesty on Lemonade halt cause; confirm no charter edits; check status tags.
