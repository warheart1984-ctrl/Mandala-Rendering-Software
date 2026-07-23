# FourDRenderer v2.0 — Render Graph Specification  
## Pass Scheduling, Resource Layouts, Barriers

| Field | Value |
| --- | --- |
| Status | **Declared** |
| Drive-G-1 | Scheduling contracts only; Unreal RDAG wiring **roadmap** |

## 1. Purpose

Define pass ordering, resource dependencies, synchronization barriers, and integration points with a host (e.g. Unreal) render graph.

## 2. Overview

FourDRenderer introduces a **4D render domain** intended to run **before** the host’s 3D domain.

```
[RayGen4D] → [Trace4D] → [Shade4D] → [PathTrace4D]
  → [ObservationRouting] → [Project4DTo3D]
  → [Host GBuffer / PathTracer / Lumen]   # roadmap for RHI
```

## 3. Pass definitions

| Pass | Inputs | Outputs | Type | Barrier |
| --- | --- | --- | --- | --- |
| RayGen4D | Camera4D, ObservationMode | Rays4D | Compute | UAV → SRV |
| Trace4D | Rays4D, BVH4D, Prims4D | Hits4D | Compute | UAV → SRV |
| Shade4D | Hits4D, Materials4D | ShadingInput4D | Compute | UAV → SRV |
| PathTrace4D | ShadingInput4D, Lights4D | PathResult4D | Compute | UAV → SRV |
| ObservationRouting | PathResult4D, ObservationModeDesc | RoutedPaths4D | Compute | UAV → SRV |
| Project4DTo3D | RoutedPaths4D, ProjectionPolicy | ShadingOutput3D | Compute | UAV → SRV |
| Host Integration | ShadingOutput3D | GBuffer / PT / Lumen | Engine-native | SRV → host RG |

## 4. Resource layout

### 4.1 Buffers

| Buffer | Contents |
| --- | --- |
| Rays4D | float4 origin + float4 direction |
| Hits4D | hit, t, prim index, pos4D, normal4D |
| ShadingInput4D | pos4D, normal4D, viewDir4D, materialId |
| PathResult4D | pos4D, normal4D, radiance4D |
| ShadingOutput3D | pos3D, normal3D, radiance3D, depth |

### 4.2 Textures

Optional 4D textures (flattened or procedural); 3D output textures for host integration.

## 5. Synchronization (**declared**)

- Prefer a dedicated async compute queue for the 4D domain when the host RHI allows.  
- Projection must complete before host GBuffer / PT consumption.  
- No 4D pass may read host resources as SoT for 4D state.  
- Host does not write 4D BVH as SoT.

## 6. RHI modifications (**declared / roadmap**)

To realize this graph inside Unreal, RHI would need:

- 4D vertex/instance buffers \((x,y,z,w)\)  
- 4D BVH + material parameter buffers  
- Compute / shader stages for Trace4D + Shade4D + Project  
- Extended descriptor layouts  
- Barriers between 4D domain and 3D domain  

**Status:** **roadmap** — not FourDAdapter v1.1 scope; not claimed present in-repo as production RHI mods.

## 7. Evidence

| Claim | Status |
| --- | --- |
| This pass graph | **declared** |
| Unreal RDAG registration | **roadmap** |
| Existing Canvas / WebGPU paths | **partial** (orthogonal; not this graph) |
