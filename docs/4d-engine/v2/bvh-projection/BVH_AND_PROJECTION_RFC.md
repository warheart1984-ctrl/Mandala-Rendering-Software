# FourDRenderer v2.0 — Core Rendering RFC  
## Module: 4D BVH & Projection Stage

| Field | Value |
| --- | --- |
| Status | **Declared** (RFC / docs). GPU kernels **roadmap** / existing BVH **partial–skeleton** |
| Depends on | Engine v1 PLP · RT4D accel · substrate BVH4D GPU notes |
| Drive-G-1 | Do not claim production GPU traversal or Unreal RHI buffers are shipping |

## 1. Purpose

Define core rendering primitives for FourDRenderer v2.0:

1. A 4D BVH over \(\mathbb{R}^{4}\) for geometry and light transport.  
2. A 4D→3D projection stage that produces host-compatible shading outputs.

This RFC is the spine of the 4D pipeline; materials, transport, and GI hang off these contracts.

## 2. Space and primitives

### 2.1 Coordinate space

- World space: \(\mathbb{R}^{4}\), \((x,y,z,w)\).  
- Ray: \(R(t)=O+tD\), \(O,D\in\mathbb{R}^{4}\), \(t\ge 0\).

### 2.2 Primitives

**4D simplex (triangle analogue):**

```cpp
struct Primitive4D {
    float4 P0, P1, P2; // optional P3 for tetra-like
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};
```

**Embedded 3D surface in 4D:**

```cpp
struct EmbeddedSurface4D {
    float4 Origin;
    float4 BasisX, BasisY, BasisZ;
    float2 UVScale;
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};
```

Each primitive carries a **projection policy** (how it collapses to 3D at shading / project time).

## 3. 4D BVH data structures

### 3.1 Node

```cpp
struct BVHNode4D {
    float4 BoundsMin;        // (x,y,z,w)
    float4 BoundsMax;
    uint32 FirstChildOrPrim;
    uint32 ChildCount;       // 0 => leaf (layout variant)
    uint32 PrimCount;
    uint32 Flags;
};
```

> **Note:** Existing MRS packed layout uses `leftChild` / `rightChild` / `firstPrim` / `primCount` (`docs/4drs/substrate/BVH4D_GPU.md`). v2 **declares** a compatible conceptual shape; wire ABI may alias fields during port.

### 3.2 Container

```cpp
struct BVH4D {
    BVHNode4D* Nodes;
    Primitive4D* Prims4D; // or EmbeddedSurface4D*
    uint32 NodeCount;
    uint32 PrimCount;
};
```

### 3.3 Partitioning (SAH-4D)

**Declared target:** generalize SAH to 4D — cost based on 4D surface measure of node bounds (not 3D surface area alone). Existing CPU builders may use simpler splits; SAH-4D quality is **not** claimed enforced.

### 3.4 SO(4) transforms

SO(4) transforms may be applied to nodes and primitives; bounds must be recomputed or transformed consistently so traversal remains valid. Conformance tests for SO(4) matrix integrity exist in renderer-core (**partial** evidence for math, not for full BVH rebuild pipelines).

## 4. Traversal kernel (declared GPU shape)

```cpp
struct Ray4D  { float4 Origin; float4 Direction; };
struct Hit4D  {
    bool   Hit;
    float  T;
    uint32 PrimIndex;
    float4 Position;
    float4 Normal;
};

// Conceptual HLSL compute
[numthreads(64, 1, 1)]
void CS_Trace4D(uint3 DTid : SV_DispatchThreadID);
```

### 4.1 4D slab intersection

For each axis \(a\in\{x,y,z,w\}\), compute \(t_{a,\min}, t_{a,\max}\). Aggregate:

\[
t_{\mathrm{entry}}=\max_a t_{a,\min},\quad
t_{\mathrm{exit}}=\min_a t_{a,\max}
\]

Hit iff \(t_{\mathrm{entry}}\le t_{\mathrm{exit}}\) and \(t_{\mathrm{exit}}\ge 0\).

Matches substrate slab math in [`docs/4drs/substrate/BVH4D_GPU.md`](../../../4drs/substrate/BVH4D_GPU.md).

## 5. Shading input contract

```cpp
struct ShadingInput4D {
    float4 Position4D;
    float4 Normal4D;
    float4 ViewDir4D;
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};
```

Minimal payload from Trace4D → Shade4D / Project4D.

## 6. Projection stage

### 6.1 Position in pipeline

After 4D intersection + shading; before host 3D rasterization / path accumulation.

### 6.2 Policies (examples)

| Id | Intent |
| --- | --- |
| `PERSPECTIVE_4D_TO_3D` | Perspective collapse using camera 4D basis |
| `SLICE_W_CONSTANT` | Slice at \(w=w_0\) |
| `STEREOGRAPHIC_4D_TO_3D` | Stereographic map |

Aligns with PLP modes (`drop_w`, `perspective_w`, `slice_hyperplane`, …) — [`../../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md).

### 6.3 Kernel signature

```cpp
struct ShadingOutput3D {
    float3 Position3D;
    float3 Normal3D;
    float3 Radiance3D;
    float  Depth;
};

[numthreads(64, 1, 1)]
void CS_Project4DTo3D(uint3 DTid : SV_DispatchThreadID);
```

### 6.4 Perspective example (conceptual)

Given camera basis \((X,Y,Z,W)\) in 4D, express hit in camera space; use \(W\) as extra depth; project onto a 3D hyperplane. Normals and radiance transform per policy.

## 7. Integration points

| Layer | Role | Evidence |
| --- | --- | --- |
| Scene builder | Populate BVH4D + prims | RT4D / surfaces **partial** |
| Ray generator | Rays4D from camera + Observation Mode | **declared** / RT4D camera **partial** |
| CS_Trace4D | Hits4D | GPU **skeleton** |
| Shade4D | ShadingInput4D | **declared** |
| CS_Project4DTo3D | ShadingOutput3D | PLP stub **skeleton** |
| Downstream host | GBuffer / PT / RT | FourDAdapter **skeleton**; RHI **roadmap** |

## 8. Evidence

| Claim | Status |
| --- | --- |
| This RFC text | **declared** |
| CPU BVH build/traverse | **partial** (`BVH4D.js` / RT4D accel) |
| Packed GPU-shaped traverse | **skeleton** |
| CUDA kernels in CI | **not claimed** |
| SAH-4D builder | **declared** |
| Unreal RHI BVH buffers | **roadmap** |
