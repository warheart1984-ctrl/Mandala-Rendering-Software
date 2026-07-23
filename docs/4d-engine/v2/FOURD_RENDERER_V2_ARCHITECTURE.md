# FourDRenderer v2.0 — Core Architecture Specification

| Field | Value |
| --- | --- |
| Version | 2.0 |
| Status | **Draft / declared** (architecture contracts) |
| Scope | 4D BVH, shading, transport, projection, Observation Modes, Unreal blend **interfaces** |
| Date | 2026-07-23 |
| Drive-G-1 | Specs define targets; GPU / Unreal RHI enforcement is **roadmap** unless Evidence says otherwise |

## 0. Framing

FourDRenderer v2.0 **declares** a higher-dimensional rendering subsystem intended to operate in \(\mathbb{R}^{4}\) and produce 3D-visible imagery through controlled projection and Observation Modes. It **extends** existing MRS / RT4D / Engine v1 work; it does not replace Canvas surface paths or FourDAdapter’s hybrid-first Scene3D consumption.

**Declared building blocks:**

1. 4D BVH over hyper-boxes for geometry and light transport  
2. SO(4)-aware BSDF contracts over \(S^{3}\) direction space  
3. 4D path-tracer loop (conceptual / hybrid with RT4D **partial** evidence)  
4. 4D→3D projection stage (aligns with PLP)  
5. Observation Mode system (extends Engine v1 `ObservationMode`)  
6. Blend interface toward Unreal’s 3D domain (**declared**; deep RHI **roadmap**)

## 1. World model

### 1.1 Space

- World space: \(\mathbb{R}^{4}\), coordinates \((x,y,z,w)\).  
- Rays: \(R(t)=O+tD\), \(O,D\in\mathbb{R}^{4}\), \(t\ge 0\).

### 1.2 Geometry (declared shapes)

```cpp
struct Primitive4D {
    float4 P0, P1, P2;   // simplex (optional P3)
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};

struct EmbeddedSurface4D {
    float4 Origin, BasisX, BasisY, BasisZ;
    float2 UVScale;
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};
```

### 1.3 Materials

Materials are **declared** SO(4)-invariant at the contract layer. Existing RT4D material modules are **partial** evidence of 4D BSDF APIs; v2 does **not** claim full SO(4) enforcement on GPU.

## 2. 4D BVH (summary)

See [bvh-projection/BVH_AND_PROJECTION_RFC.md](./bvh-projection/BVH_AND_PROJECTION_RFC.md).

- Nodes store 4D AABBs `(BoundsMin, BoundsMax)`.  
- Traversal uses 4D slab tests including \(W\).  
- Partitioning target: SAH generalized to 4D surface measure (**declared**).  
- Existing evidence: CPU `BVH4D` (**partial**), packed/CUDA sketches (**skeleton**) — [`docs/4drs/substrate/BVH4D_GPU.md`](../../4drs/substrate/BVH4D_GPU.md).

## 3. Shading model (SO(4) BSDFs)

See [shading-transport/SHADING_AND_TRANSPORT_RFC.md](./shading-transport/SHADING_AND_TRANSPORT_RFC.md).

```cpp
struct ShadingFrame4D { float4 N, T1, T2, T3; };
struct BSDF4D {
    BSDFSample4D Sample(...);
    BSDFEval4D   Evaluate(...);
};
```

Invariance and energy conservation over \(S^{3}\) are **declared** requirements for a future conforming implementation.

## 4. 4D path tracing

Conceptual loop: generate 4D ray → Trace BVH → frame → emission → sample BSDF → throughput → Russian roulette → Observation Mode routing.

RT4D’s `PathTracer4D` / `renderRT4DFrame` are **partial** prior art; v2 adds Observation Mode routing and host blend contracts.

## 5. Projection stage (4D→3D)

Runs after 4D intersection + shading; produces Unreal-/host-compatible 3D payloads:

```cpp
struct ShadingOutput3D {
    float3 Position3D;
    float3 Normal3D;
    float3 Radiance3D;
    float  Depth;
};
```

Policies (examples): `PERSPECTIVE_4D_TO_3D`, `SLICE_W_CONSTANT`, `STEREOGRAPHIC_4D_TO_3D`.  
Aligns with PLP observation modes: [`../v1/plp/PLP_V1.md`](../v1/plp/PLP_V1.md).

## 6. Observation Modes

See [observation/OBSERVATION_MODE_RFC.md](./observation/OBSERVATION_MODE_RFC.md).

Each mode binds projection, path routing (`FULL_4D` / `HYBRID_4D_3D` / `3D_ONLY`), visibility, and blend policies, plus optional \(W\) slice bands.

## 7. Lighting blend with Unreal (**declared / roadmap**)

Blend modes: `REPLACE`, `ADDITIVE`, `WEIGHTED`, `MASKED`.  
Targets: GBuffer, path tracer, Lumen GI — **interfaces declared**; implementation **roadmap**.

## 8. Pipeline overview

```
RayGen4D → Trace4D → Shade4D → PathTrace4D
  → ObservationRouting → Project4DTo3D
  → Unreal / host 3D domain (GBuffer · PT · Lumen)   [roadmap for RHI]
```

Data flow:

```
4D World → BVH4D → Trace4D → Shade4D → PathTrace4D
        → ObservationMode → Project4D→3D → Host lighting → Final frame
```

Render graph detail: [render-graph/RENDER_GRAPH_SPEC.md](./render-graph/RENDER_GRAPH_SPEC.md).  
Shader ABI: [shader-abi/SHADER_ABI.md](./shader-abi/SHADER_ABI.md).

## 9. Unreal integration contract

### 9.1 Required interfaces (**declared**)

- Scene3D + lineageBundle import (already **skeleton** in FourDAdapter)  
- `ShadingOutput3D` → GBuffer / path-tracer accumulation (**roadmap**)  
- `ObservationModeId` exposed to Sequencer (**roadmap**; v1.1 Sequencer track is separate **skeleton**)

### 9.2 Non-goals (constitutional boundary)

- Unreal does **not** compute 4D  
- Unreal does **not** store 4D BVH as SoT  
- Unreal does **not** evaluate SO(4) BSDFs as SoT  
- FourDAdapter v1.1 remains hybrid-first consumer — see [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../v1/adapters/UNREAL_ADAPTER_V1.md)

## 10. Determinism & governance

| Requirement | Status |
| --- | --- |
| Same world + mode + time → same view | **declared** |
| Lineage preserved through project / blend | **declared** (PLP PL-1…PL-5) |
| Versioned modes / policies / BSDFs | **declared** |

## 11. Evidence summary

| Layer | Status |
| --- | --- |
| This architecture document | **draft / declared** |
| MRS RT4D / BVH4D / surfaces | **partial** / **skeleton** (see [README](./README.md)) |
| v2 GPU compute pipeline | **roadmap** |
| Unreal RHI / Nanite / Lumen deep paths | **roadmap** |

## 12. Summary

FourDRenderer v2.0 **declares** a coherent pipeline from 4D geometry through projection into 3D host imagery, with Observation Modes as first-class view contracts. Implementation maturity remains split: MRS reference paths are **partial**; v2 GPU and Unreal RHI work are **roadmap**.
