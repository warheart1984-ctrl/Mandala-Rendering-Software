# FourDRenderer v2.0 — Whitepaper & Technical Overview

| Field | Value |
| --- | --- |
| Version | 2.0 |
| Status | **Draft / declared** — technical overview |
| Date | 2026-07-23 |
| Drive-G-1 | Softened claims; no marketing superlatives |

## Abstract

FourDRenderer v2.0 **declares** a higher-dimensional rendering architecture intended to operate in \(\mathbb{R}^{4}\) and produce host-visible 3D imagery through governed projection and Observation Modes. The suite covers:

- 4D BVH contracts for geometry and light transport  
- SO(4)-aware material / BSDF interfaces over \(S^{3}\)  
- A 4D path-tracing loop (conceptual; builds on RT4D **partial** evidence)  
- Observation Modes for view selection and path routing  
- A 4D→3D projection stage compatible with PLP / Scene3D hosts  
- A **declared** blend interface toward Unreal raster, path tracer, and Lumen (**roadmap** to implement)  
- Render graph, shader ABI, materials, samples S1–S4, test categories, and a **design** GPU budget  

This document consolidates the RFC suite. It is **not** a claim that the full GPU/Unreal stack is shipping.

## 1. Introduction

Traditional real-time engines operate primarily in \(\mathbb{R}^{3}\). FourDRenderer v2.0 **extends** that model with contracts for:

- 4D geometry and spatial indexing  
- 4D lighting and path transport  
- 4D materials (SO(4)-aware parameters)  
- Observation Modes and projection into 3D  

MRS already provides **partial** Canvas / RT4D / BVH4D paths and Engine v1 World Format / PLP declarations. v2.0 organizes the next architecture track; deep Unreal RHI integration remains **roadmap**.

## 2. World model

World space: \((x,y,z,w)\in\mathbb{R}^{4}\).  
Primitives: `Primitive4D` (simplices) and `EmbeddedSurface4D` (3D surfaces embedded in 4D).  
Materials: declared SO(4)-invariant; evaluate in 4D, emit 3D-visible radiance after projection.

## 3. 4D BVH

Nodes store 4D AABB bounds. Ray–node tests use a 4D slab method across \(x,y,z,w\). Primitives carry `MaterialId` and `ProjectionPolicyId`.  

**Evidence today:** CPU BVH4D **partial**; GPU packed/CUDA **skeleton** (`docs/4drs/substrate/BVH4D_GPU.md`).  
**v2 extends:** SAH-4D partitioning language, projection-policy attachment, shader ABI buffers — see [bvh-projection/BVH_AND_PROJECTION_RFC.md](./bvh-projection/BVH_AND_PROJECTION_RFC.md).

## 4. SO(4) shading model

Shading frame \(\{N,T_1,T_2,T_3\}\) in \(\mathbb{R}^{4}\). BSDFs operate over \(S^{3}\) (Lambert4D, GGX4D, hybrid, custom — **declared** types). Energy conservation integrals are defined over 4D solid angle as a **target**.

**Not claimed:** production SO(4) BSDF enforcement on Unreal RHI.

## 5. 4D path tracing

Paths store origin, direction, throughput, bounce count. The loop traces BVH4D, evaluates BSDF4D, routes via Observation Mode, and projects when required. RT4D supplies **partial** prior art; hybrid bounce with Unreal is **declared**.

## 6. Observation Modes

Each mode binds `ProjectionPolicyId`, `PathRoutingPolicyId`, `VisibilityPolicyId`, `BlendPolicyId`, and optional \(W\) slice. Routing: `FULL_4D`, `HYBRID_4D_3D`, `3D_ONLY`. Modes are deterministic and versioned (**declared**). See [observation/OBSERVATION_MODE_RFC.md](./observation/OBSERVATION_MODE_RFC.md) and Engine v1 PLP.

## 7. Projection stage

Converts 4D shading results to `Position3D`, `Normal3D`, `Radiance3D`, `Depth` before host GBuffer / path / composite. Aligns with PLP `projectWorld` (**skeleton** stub today).

## 8. Render graph & shader ABI

Passes: RayGen4D → Trace4D → Shade4D → PathTrace4D → ObservationRouting → Project4DTo3D → Unreal Integration.  
ABI: `Ray4D`, `Hit4D`, `ShadingInput4D`, `ShadingOutput3D`, bindings t0–t3 / u0–u3, intrinsics `dot4`, `normalize4`, `sampleS3`, …  

**Status:** **declared** contracts; GPU scheduling in Unreal **roadmap**.

## 9. Material system

Descriptors include BSDF type, 4D/hybrid/3D-only flags, base color, roughness, optional W-anisotropy. 4D textures may be procedural or atlas-encoded (**declared**). Material compiler dual-emit (4D + 3D fallback) is **declared / roadmap**.

## 10. Sample scenes & validation

Scenes S1–S4 and test categories T1–T5 are **declared** bring-up / regression contracts — not yet claimed as golden CI artifacts for v2 GPU.

## 11. Performance model

Cost ∝ rays × log(nodes) for Trace4D; rays × bounces for shading. Real-time preview **design target:** 4–6 ms for 4D domain on a future target GPU — **not a measured SLA**. See [performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md](./performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md).

## 12. Integration with Unreal Engine

```
4D World → BVH → Shading → PathTrace → Project → Unreal 3D domain
```

FourDRenderer remains upstream authority. FourDAdapter stays hybrid-first Scene3D consumer. Nanite W-awareness and Lumen W-GI are **roadmap** extensions, not FourDAdapter v1.1 scope.

## 13. Conclusion

FourDRenderer v2.0 is a **declared** architecture for governed 4D→3D rendering contracts, grounded in existing MRS / Engine v1 evidence where available, and explicit about what remains skeleton or roadmap. Prefer technical contracts over marketing language when citing this suite.

## Index

Full document map: [README.md](./README.md).
