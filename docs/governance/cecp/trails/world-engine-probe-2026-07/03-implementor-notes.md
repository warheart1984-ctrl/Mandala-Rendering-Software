# 03 — Implementor notes

**Role:** Implementor · **Mode:** Constructor + Render-Physicist  
**Status:** partial

## What shipped

1. `applyAmendmentVIIToMeshes` — soft/strict; require scaleClass; shrink oversized fixture heads toward `referenceHeight × mid(headToHeight)`; deterministic organic asymmetry; `bakeScale` flag for cinematic character builder.  
2. `renderEngine3dStill({ amendmentVII: true })` soft path.  
3. Cinematic: `--amendment-vii` / default-on with `--cinematic-v2`; `mats.amendmentScaleMul`; re-apply on posed faces.  
4. Proof script → before/after PNG + JSON.  
5. Tests: `amendment-vii-render-apply.test.ts` (3/3).

## Anti-overclaim

- Soft-raster only; not photoreal.  
- Soft biometric may warn on AABB proxies without HALT.  
- World engine **not** implemented.

## Gaps

- Organic nudge is subtle vs scale change (RMS already high on fixtures).  
- Full skeletal biometric still **partial**.  
- World Profiles remain **declared**.
