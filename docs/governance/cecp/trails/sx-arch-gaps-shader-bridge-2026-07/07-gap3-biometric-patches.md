# 07 — Gap-3 patches: biometric / inheritance / normalization

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Implementor follow-on (declared→**partial**)  
**Date:** 2026-07-30  
**Protected paths:** untouched

## Intent

User patches for Gap 3 (fixtures / faces / box sets):

1. Constitutional biometric profiles (lawful ranges)
2. Adaptive metric inheritance (scale classes)
3. Audit soft-raster normalization vs organic variance

## Shipped

| Artifact | Path | Tag |
|----------|------|-----|
| Schema | `mrs/assets/human/schemas/biometric-profile.schema.json` | **partial** |
| Catalog | `mrs/assets/human/biometric-profiles.json` | **partial** |
| Loader / validate | `mrs/packages/engine3d-core/src/face/BiometricProfile.ts` | **partial** |
| Inheritance | `mrs/packages/engine3d-core/src/face/MetricInheritance.ts` | **partial** |
| Normalization audit | `mrs/packages/engine3d-core/src/renderer/raster/OrganicVariance.ts` | **partial** |
| Tests | `test/face/biometric-inheritance.test.ts` | enforced by unit tests |
| Proof | `docs/4d-engine/proofs/sx-arch-gaps-2026-07/gap3-biometric-inheritance-audit.json` | evidence |

## Normalization audit (honest)

Soft-raster does **not** mirror-average vertices or force bilateral symmetry. Unit-normalize is lighting-only. Near-flat organic look on demos comes from **fixture authoring** (synthetic GLB / UV spheres), not a flatten pass. `overNormalizesOrganicVariance: false`.

## Anti-overclaim

- Not full constitutional biometric enforcement
- Face AABB cannot invent true limb ratios (`limb-metrics-unavailable` when required)
- Gaps 1–2 unchanged: bridge **partial**; Lemonade SD **blocked** (`sd_server`)

## Tests

`npm run test:biometric` (expected PASS)
