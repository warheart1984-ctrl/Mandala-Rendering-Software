# FourDRenderer v2.0 — Shading & Transport RFC  
## Module: SO(4) BSDFs, 4D Path Tracing, Host Lighting Blend

| Field | Value |
| --- | --- |
| Status | **Declared** (RFC). SO(4) GPU enforcement **not claimed** |
| Depends on | [BVH & Projection RFC](../bvh-projection/BVH_AND_PROJECTION_RFC.md) · RT4D materials (**partial**) |
| Drive-G-1 | Prefer “declares / prepares / aligns with” until tests prove enforcement |

## 1. Purpose

Define the shading and light-transport layer:

1. SO(4)-aware BSDFs in 4D world space.  
2. A 4D path-tracing loop over \(\mathbb{R}^{4}\) / \(S^{3}\).  
3. A blending model that merges 4D lighting with a host’s 3D lighting (Unreal path tracer / Lumen / raster) — **declared**; deep host wiring **roadmap**.

## 2. Shading space and frames

- World: \(\mathbb{R}^{4}\).  
- Directions: unit vectors on \(S^{3}\).

```cpp
struct ShadingFrame4D {
    float4 N;   // primary normal
    float4 T1, T2, T3;
};
```

\(\{N,T_1,T_2,T_3\}\) form an orthonormal basis in \(\mathbb{R}^{4}\).

## 3. SO(4) BSDF model

### 3.1 Interface

```cpp
struct BSDFSample4D {
    float4 Wo;
    float3 F;
    float  Pdf;   // over S^3
    bool   Valid;
};

struct BSDFEval4D {
    float3 F;
    float  Pdf;
};

struct BSDF4D {
    uint32 MaterialId;
    BSDFSample4D Sample(const float4& Wi, const ShadingFrame4D& Frame, const float2& Xi) const;
    BSDFEval4D   Evaluate(const float4& Wi, const float4& Wo, const ShadingFrame4D& Frame) const;
};
```

### 3.2 Invariance (**declared requirement**)

BSDF parameters should not depend on a privileged 3D subspace. Behavior unchanged under \(R\in\mathrm{SO}(4)\) applied consistently to geometry and directions. Practically: depend on 4D angular relationships (dot products), not absolute axes.

Existing renderer-core tests check SO(4) matrix integrity (**partial** math evidence), not full BSDF invariance suites for v2.

### 3.3 Energy conservation (**declared target**)

Integrals over \(S^{3}\); PDFs adjusted for 4D solid angle. Target:

\[
\int_{S^{3}} f(\omega_i,\omega_o)\cos\theta\,d\omega_o \le 1
\]

with \(\theta\) in the 4D frame.

### 3.4 Practical compromise

Evaluate in 4D; project result to 3D radiance for the host pipeline. Materials “live” in 4D but emit 3D-visible light.

## 4. 4D path-tracing loop

```cpp
struct PathState4D {
    float4 RayOrigin, RayDir;
    float3 Throughput;
    uint32 BounceCount;
    bool   Alive;
};
```

Conceptual loop per camera ray:

1. Initialize `PathState4D` from camera / Observation Mode.  
2. For each bounce: Trace BVH → Hit4D; if miss, accumulate env and terminate.  
3. Build `ShadingFrame4D`; evaluate emission; sample `BSDF4D`.  
4. Update throughput \(T \leftarrow T\cdot F/\mathrm{Pdf}\); Russian roulette.  
5. Observation Mode decides stay-in-4D vs project-to-3D.

RT4D `PathTracer4D` is **partial** prior art ([`docs/4drs/ARCHITECTURE.md`](../../../4drs/ARCHITECTURE.md)).

## 5. Radiance projection

```cpp
struct PathResult4D { float4 Position4D, Normal4D; float3 Radiance4D; };
struct PathResult3D { float3 Position3D, Normal3D, Radiance3D; };
```

Uses the same `ProjectionPolicyId` family as the BVH RFC. Radiance may include W-dependent weighting.

## 6. Blending with Unreal lighting (**declared / roadmap**)

### 6.1 Targets

Unreal path tracer · Lumen GI · deferred GBuffer / raster.

### 6.2 Blend modes

| Mode | Formula / intent |
| --- | --- |
| Replace | \(L_{\mathrm{final}}=L_{4D}\) |
| Additive | \(L_{\mathrm{final}}=L_{\mathrm{UE}}+L_{4D}\) |
| Weighted | \(L_{\mathrm{final}}=(1-\alpha)L_{\mathrm{UE}}+\alpha L_{4D}\) |
| Masked | Apply 4D only on masks / regions |

### 6.3 Path-tracer strategies (**declared**)

1. **Pre-computed 4D pass** — radiance buffer as external contribution.  
2. **Hybrid bounce** — some bounces FourDRenderer, some Unreal; shared path state flags.

### 6.4 Lumen

Treat 4D GI as additional indirect; caches may sample 4D buffers; W-band blending — all **roadmap**.

## 7. Material flags and routing

| Flag | Meaning |
| --- | --- |
| `Use4DShading` | Participate in BSDF4D |
| `Use3DOnly` | Host-native shading only |
| `Hybrid4D3D` | Evaluate both and blend |

Observation Mode + material flags jointly decide routing. See [materials/MATERIAL_SYSTEM_RFC.md](../materials/MATERIAL_SYSTEM_RFC.md).

## 8. Evidence

| Claim | Status |
| --- | --- |
| This RFC | **declared** |
| RT4D material / BSDF modules | **partial** |
| SO(4) BSDF GPU enforcement | **not claimed** |
| Unreal PT / Lumen blend | **roadmap** |
| Hybrid bounce runtime | **declared** |
