# FourDRenderer v2 — interop shading types

| Field | Value |
| --- | --- |
| Status | **declared** (schema + host mirrors) |
| Package SoT | `mrs/packages/renderer-core/src/interop/` |
| Drive-G-1 | Aligns with RFC field names; does **not** claim production GPU BVH traversal or photoreal Shade4D |

## RFC sources

- [`docs/4d-engine/v2/bvh-projection/BVH_AND_PROJECTION_RFC.md`](../../../../../docs/4d-engine/v2/bvh-projection/BVH_AND_PROJECTION_RFC.md)
- [`docs/4d-engine/v2/observation/OBSERVATION_MODE_RFC.md`](../../../../../docs/4d-engine/v2/observation/OBSERVATION_MODE_RFC.md)
- [`docs/4d-engine/v2/materials/MATERIAL_SYSTEM_RFC.md`](../../../../../docs/4d-engine/v2/materials/MATERIAL_SYSTEM_RFC.md)
- HLSL sample: [`docs/4d-engine/v2/shader-abi/FourDRendererTypes.hlsli`](../../../../../docs/4d-engine/v2/shader-abi/FourDRendererTypes.hlsli)

## PLP relation

**PLP remains the host Scene3D path** (`docs/4d-engine/v1/plp/PLP_V1.md`).  
Interop structs prepare Trace4D → Shade4D → Project4D contracts. Unity’s `ShadingInput4D` ComputeBuffer and Unreal `SendShadingData` are **inspection / debug** channels — not a replacement for PLP `projectWorld` → Scene3D.

## Struct catalog

| Struct | Status | Notes |
| --- | --- | --- |
| `Primitive4D` | declared | Simplex + MaterialId + ProjectionPolicyId |
| `EmbeddedSurface4D` | declared | Origin + BasisXYZ + UVScale |
| `BVHNode4D` / `BVH4D` | declared | Conceptual v2 shape; substrate packed layout may alias |
| `Ray4D` / `Hit4D` | declared | `Hit` is uint/int 0/1 — not C# `bool` |
| `ShadingInput4D` / `ShadingOutput3D` | declared | Stride 56 / 40 (HLSL SoT) |
| `ObservationModeId` / `ObservationModeDesc` | declared | uint64 id + policy ids + W slice |
| `Material4DDesc` | declared | BSDF flags + BaseColor |

## Host mirrors

| Artifact | Status |
| --- | --- |
| `fourd-shading-types.json` + `index.js` | declared |
| Unity `FourDRendererTypes.cs` + buffer in `FourDTesseractRenderer` | partial |
| Unity LiveLink publish-toggle cleanup (`ShouldReleaseShadingLiveLinkOnToggle` + Node mirror) | partial — Node gate enforced; Unity Editor Play Mode not CI-run |
| LiveLink `shading_update` JSON (`src/live-link/shadingWire.js`, port 9487) | partial |
| Unreal `FourDShadingTypes.h` / `FourDRendererTypes.h` + LiveLink stub | skeleton |
| HLSL / USH headers | declared (header only) |

## ObservationModeId (host SoT)

| Choice | Wire / uint64 |
| --- | --- |
| Perspective4DTo3D | `0x1000000000000001` |
| WSliceConstant | `0x1000000000000002` |

ProjectionPolicyId: `0` perspective · `1` W-slice · `2` stereographic (declared).

## Test

```bash
cd mrs/packages/renderer-core
npm run test:interop
npm run test:shading-wire
npm run validate:shading-ws
```
