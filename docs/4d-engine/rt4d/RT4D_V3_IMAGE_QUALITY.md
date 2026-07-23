# RT4D v3.0 — Image quality & stability

> **Status:** **roadmap / declared** (Drive-G-1).  
> Depends on v2 GPU core themes (queues, adaptive spp, temporal buffers) as **declared** prerequisites — not as shipped gates.  
> Master index: [`RT4D_EVOLUTION_ROADMAP.md`](./RT4D_EVOLUTION_ROADMAP.md).

**Scope:** Raise image quality and temporal stability of the RT4D path core once GPU accumulation exists.  
**Softened quality claim:** milestones **target** production-quality appearance at low spp (**declared**). Do not claim “production-grade images” are delivered.

## Current baseline (evidence)

| Piece | Status | Path / note |
| --- | --- | --- |
| CPU BSDF sampling + power-heuristic helpers | **partial** | `PathTracer4D` / `math/s3.js` (`powerHeuristic`) |
| Pluggable integrator interface (path / BDPT / light-field) | **not present** | Single CPU path tracer class |
| Integrated denoiser (normals, albedo, depth, W) | **not present** | — |
| Robust temporal (ghosting/clamping/reactive masks) | **not present** | v2 temporal is also **roadmap** |

## 1. Denoising (4D-aware)

**Intent (declared):** Integrate a denoiser that uses normals, albedo, depth, and optionally W-axis features.

| | |
| --- | --- |
| **Milestone** | First integrated denoiser pass after accumulation |
| **Declared outcome** | Targets production-quality appearance at low spp (**declared**) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. AOV / G-buffer contracts for denoiser inputs (align with projector / FourDRenderer AOVs where useful).  
2. First pass may wrap an existing spatial/temporal denoiser; 4D / W features are **optional extensions**.  
3. Do not claim vendor or research denoisers are integrated until code and tests exist.

## 2. Advanced integrators

**Intent (declared):**

- MIS for lights / BRDFs in 4D  
- Better handling of caustics and complex transport  
- Pluggable integrator interface (path, bidirectional, light-field variants)

| | |
| --- | --- |
| **Milestone** | Pluggable integrator interface (path, bidirectional, light-field variants) |
| **Declared outcome** | Stronger caustic / complex transport handling (**target**) |
| **Status** | **roadmap** (CPU MIS helpers remain **partial** prior art only) |

### Planned work (not claimed done)

1. Extract integrator API from `PathTracer4D` without breaking the v1.0 freeze surface (versioned extension).  
2. Full light/BSDF MIS on GPU paths — **not** claimed from CPU `powerHeuristic` alone.  
3. Bidirectional / light-field variants remain **declared** until implemented.

## 3. Robust temporal pipeline

**Intent (declared):** Ghosting / lag reduction, history clamping, reactive masks.

| | |
| --- | --- |
| **Milestone** | Stable temporal accumulation under motion and lighting changes |
| **Declared outcome** | Usable interactive / cinematic refinement without obvious trails (**target**) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. History clamping and reactive update masks on top of v2 temporal buffers.  
2. Lighting-change detection (exact signals **TBD**).  
3. Validation under scripted motion — measurements **TBD**.

## Exit criteria for calling v3.0 “landed” (future)

- [ ] Denoiser pass wired after accumulation with documented AOV inputs  
- [ ] At least two integrators selectable via a stable interface, with tests  
- [ ] Temporal stability controls (clamp / reactive mask) exercised in a regression scene  

Until then, keep status **roadmap**.

## Cross-links

- Prior: [`RT4D_V2_GPU_CORE.md`](./RT4D_V2_GPU_CORE.md)  
- Next: [`RT4D_V4_SCALE_AND_BACKENDS.md`](./RT4D_V4_SCALE_AND_BACKENDS.md)  
- Materials / transport RFCs (architecture track): [`../v2/materials/MATERIAL_SYSTEM_RFC.md`](../v2/materials/MATERIAL_SYSTEM_RFC.md), [`../v2/shading-transport/SHADING_AND_TRANSPORT_RFC.md`](../v2/shading-transport/SHADING_AND_TRANSPORT_RFC.md)
