# FourDRenderer v2.0 — Shader ABI  
## GPU Interface, Data Contracts, Intrinsics, Bindings

| Field | Value |
| --- | --- |
| Status | **Declared** |
| Drive-G-1 | ABI is a contract for future kernels; not a claim that HLSL/USF ships |

## 1. Purpose

Define the GPU-side ABI: buffer formats, intrinsics, binding slots, material and projection payloads.

## 2. Core types

```cpp
typedef float4   float4D;
typedef float3   float3D;
typedef float4x4 float4x4D; // 4D linear transform (layout TBD per backend)
```

## 3. Ray / Hit / Shading

```cpp
struct Ray4D {
    float4 Origin;
    float4 Direction;
};

struct Hit4D {
    uint   Hit;
    float  T;
    uint   PrimIndex;
    float4 Position4D;
    float4 Normal4D;
};

struct ShadingInput4D {
    float4 Position4D;
    float4 Normal4D;
    float4 ViewDir4D;
    uint32 MaterialId;
    uint32 ProjectionPolicyId;
};
```

## 4. BSDF ABI

```cpp
struct BSDFSample4D {
    float4 Wo;
    float3 F;
    float  Pdf;
    uint   Valid;
};

struct BSDFEval4D {
    float3 F;
    float  Pdf;
};
```

## 5. Projection ABI

```cpp
struct ShadingOutput3D {
    float3 Position3D;
    float3 Normal3D;
    float3 Radiance3D;
    float  Depth;
};
```

## 6. Binding layout (compute — conceptual)

| Slot | Resource |
| --- | --- |
| t0 | Rays4D |
| t1 | BVHNodes4D |
| t2 | Prims4D |
| t3 | Materials4D |
| u0 | Hits4D |
| u1 | ShadingInput4D |
| u2 | PathResult4D |
| u3 | ShadingOutput3D |

Exact register mapping may differ per backend (HLSL / WGSL / CUDA). Existing WebGPU packed-uniform contracts in MRS remain separate surfaces.

## 7. Intrinsics (**declared**)

### 4D math

- `dot4(a,b)`  
- `normalize4(a)`  
- `reflect4(I,N)`  
- `refract4(I,N,eta)`  
- `orthonormalize4(N)` → frame helpers  

### Sampling

- `sampleS3(Xi)` — uniform on \(S^{3}\)  
- `sampleHemisphere4D(Xi)` — cosine-weighted 4D hemisphere  

## 8. Material compiler extensions (**declared / roadmap**)

- Extend shader language with 4D vector types / intrinsics.  
- Tag materials `4D-aware` / `SO(4)-invariant`.  
- Emit both 4D shading and 3D fallback variants.  
- Editor nodes for W-dependent behavior, 4D textures, 4D noise.

**Not claimed:** shipping Unreal material compiler patches.

## 9. Evidence

| Claim | Status |
| --- | --- |
| This ABI document | **declared** |
| WGSL/WebGPU surface uniforms | **partial** (MRS; different contract) |
| CUDA/WGSL BVH sketches | **skeleton** |
| Full HLSL ABI in UE | **roadmap** |
