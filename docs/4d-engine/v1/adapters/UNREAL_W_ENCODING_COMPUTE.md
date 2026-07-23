# Unreal W-encoding compute (`CS_WEncoding`) — **declared** / **roadmap**

> **Drive-G-1:** This document **declares** a future compute path for per-primitive W visualization buffers.  
> There is **no** HLSL, `.usf`, RDG pass, or UE compile evidence in-repo. Do **not** claim compute W-encoding works.

**Status:** **declared** (API/buffer sketch) · implementation = **roadmap**

---

## 1. Intent

Optional GPU path to write W-derived visualization attributes (heatmap / contour / ghost weights) into buffers consumed by materials — as an alternative to per-draw CPU parameter stomps. Still consumes lineage/W values already present on projected geometry; does **not** compute 4D projection.

---

## 2. Declared dispatch (`CS_WEncoding`)

| Item | Declared shape |
| --- | --- |
| Shader | `CS_WEncoding.usf` (not shipped) |
| Thread group | TBD (e.g. 64) |
| Inputs | Structured buffer of `{ PrimitiveId, WMin, WMax, WDepth }` |
| Outputs | `RWBuffer` / texture of encoded viz (RGBA8 or float) |
| Bind | Global slice uniforms: `WSliceMin`, `WSliceMax`, `WDepthMode`, `GhostOpacity` |

### Buffer sketch (**declared**)

```text
StructuredBuffer<FWEncodingIn>  InPrimitives;   // W band per projected primitive
RWStructuredBuffer<FWEncodingOut> OutEncoded;   // packed viz factors
cbuffer FFourDWSliceCB { float WSliceMin; float WSliceMax; int WDepthMode; float GhostOpacity; };
```

---

## 3. Integration points (**roadmap**)

1. Sequencer / viz component updates slice CB
2. Dispatch `CS_WEncoding`
3. Materials sample `OutEncoded` (or bind as MID params still — hybrid)

Until then, CPU `UFourDMaterialMapper` remains the declared path.

---

## 4. Non-claims

- No Nanite compute integration claimed
- No live Sequencer→compute preview claimed
- No shader compilation in CI

## Cross-links

- [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md)
- [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md)
