# 02 — Builder scaffold manifest

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Builder (CECP 02)  
**Cites:** `01-architect-adr.md`  
**mode:** Blueprint + Boundary-Guardian

## Intent

Scaffold modules from Architect ADR without deep business logic (Implementor fills).

## Scaffold manifest (created paths)

| Path | Kind | Label |
|------|------|-------|
| `mrs/packages/engine3d-core/src/renderer/raster/ShaderBridge.ts` | module | **partial** (filled by Implementor) |
| `mrs/packages/engine3d-core/src/face/FixtureFaceRegistry.ts` | module | **partial** |
| `mrs/packages/engine3d-core/test/renderer/shader-bridge.test.ts` | tests | placeholder→filled |
| `mrs/packages/engine3d-core/test/face/fixture-registry.test.ts` | tests | placeholder→filled |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` | extend | ACES export shell |
| `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js` | extend | provenance APIs |
| `docs/4d-engine/proofs/sx-arch-gaps-2026-07/` | proofs dir | created |
| `tmp/sx-arch-gaps-2026-07/` | tmp proofs | created |

## Dependency graph

```
ConstitutionalMaterialDescriptor
  → ShaderBridge.constitutionalToPbr
  → UniversalMaterial / RasterMaterial
  → HeadlessStillRenderer + applyAcesApproxToneMap

HumanFaceRigged.glb
  → FixtureFaceRegistry.registerFixtureFace
  → GovernedAssetManifest + AABB validate
  → AssetRegistry (optional)

Lemonade catalog / weight files
  → verifyModelWeightsProvenance
  → generateStillViaLemonade (haltCauseClass)
```

## Build artifacts inventory

- ShaderBridge exports: skeleton→**partial**
- FixtureFaceRegistry: skeleton→**partial**
- Lemonade provenance gate: skeleton→**partial**
- Tone-map: declared→**partial**

## Test placeholders created

- `test:shader-bridge`
- `test:fixture-registry`
- lemonadeSdAdapter provenance unit cases

## Handoff to Implementor

Fill PBR defaults, ACES approx, fixture AABB from GLB, Lemonade checksum gate + classifyHaltCause; write proofs; run tests.
