# API Reference Manual — FourDRenderer v2.0  
## Declared API Sketch (Not an Implemented SDK)

| Field | Value |
| --- | --- |
| Status | **Declared API sketch** |
| Drive-G-1 | This document does **not** claim a shipped SDK, bindings, or package versions |
| Canonical contracts | [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md), [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md) |

> If you need runtime truth, consult code and tests — not this sketch.

## 1. Scope

This manual summarizes the **developer-facing surface** as declared in the v2 RFCs:

- CPU/GPU data contracts (rays, hits, BVH nodes, materials)  
- Conceptual pass entry points (RayGen / Trace / Shade / PathTrace / Project / Observation routing)  
- Host blend outputs (`ShadingOutput3D`)  

It is **not**:

- A versioned C++/C#/Rust SDK  
- A promise that Unreal plugins export these symbols today  
- Documentation of measured performance

## 2. Core types (sketch)

Aligned with Shader ABI / Architecture (layouts may differ per backend):

```cpp
struct Ray4D { float4 Origin; float4 Direction; };

struct Hit4D {
    uint   Hit;
    float  T;
    uint   PrimIndex;
    float4 Position4D;
    float4 Normal4D;
};

struct Primitive4D {
    float4 P0, P1, P2;
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};

struct ShadingFrame4D { float4 N, T1, T2, T3; };

struct ShadingOutput3D {
    float3 Position3D;
    float3 Normal3D;
    float3 Radiance3D;
    float  Depth;
};
```

## 3. Conceptual pass API

Names are **contract IDs** for the render-graph / roadmap kernels — not a claim of exported engine APIs:

| Symbol (conceptual) | Role | Status |
| --- | --- | --- |
| `RayGen4D` | Generate 4D primary / secondary rays | Roadmap (GPU) |
| `Trace4D` | Traverse 4D BVH; write hits | Declared; CPU BVH **partial**; GPU **skeleton** |
| `Shade4D` / `BSDF4D::{Sample,Evaluate}` | SO(4)-aware shading contracts | Declared; GPU enforcement **not claimed** |
| `PathTrace4D` | Bounce loop + RR | Declared; RT4D **partial** prior art |
| `Project4DTo3D` | Map to host-visible 3D | Declared; aligns with PLP |
| `ObservationRoute` | Mode-based routing / blend policy | Declared (extends Engine v1) |

See [`../render-graph/RENDER_GRAPH_SPEC.md`](../render-graph/RENDER_GRAPH_SPEC.md).

## 4. Binding sketch (compute)

| Slot | Resource |
| --- | --- |
| t0 | Rays4D |
| t1 | BVHNodes4D |
| t2 | Prims4D |
| t3 | Materials4D |
| u0 | Hits / radiance buffers (TBD per pass) |

Full detail: [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md).

## 5. Host integration sketch

```
FourDRenderer (contracts / future kernels)
    → ShadingOutput3D + lineage
    → FourDAdapter / host deferred or PT path
```

- FourDAdapter v1.x: **consumer** of Scene3D + lineage (**skeleton**).  
- Deep RHI injection: **Phase 3 roadmap**.

## 6. Error / validation (declared)

Validation categories T1–T5 are **declared** in [`../validation/TEST_SUITE_AND_VALIDATION.md`](../validation/TEST_SUITE_AND_VALIDATION.md). Do not treat category IDs as a green CI suite for v2 GPU.

## 7. Versioning

Until an SDK exists, treat this file as **comms overlay** on RFCs. Breaking changes belong in the RFCs first; refresh this sketch afterward.
