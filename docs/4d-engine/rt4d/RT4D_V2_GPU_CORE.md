# RT4D v2.0 — GPU core evolution

> **Status:** **roadmap / declared** (Drive-G-1).  
> Prerequisites: 4DRS RT4D v1.0 CPU path tracer (**partial**) and GPU BVH / WebGPU dispatch sketches (**skeleton**).  
> Master index: [`RT4D_EVOLUTION_ROADMAP.md`](./RT4D_EVOLUTION_ROADMAP.md).

**Scope:** Evolve the RT4D GPU path from per-pixel bounce-style dispatch toward queue-driven, variance-aware, temporally accumulating cores.  
**Out of scope here:** Full FourDRenderer v2 Observation Mode / host-blend architecture ([`../v2/`](../v2/README.md)).

## Current baseline (evidence)

| Piece | Status | Path |
| --- | --- | --- |
| CPU bounce loop path tracer | **partial** | `mrs/.../rt4d/integrator/PathTracer4D.js`, `renderRT4DFrame` |
| WebGPU orchestrator (raygen → BVH → shade → accumulate) | **skeleton / partial** | `mrs/.../rt4d/gpu/RT4DGPURenderer.js` + WGSL modules |
| Wavefront / stage queues | **not present** | — |
| Per-pixel variance adaptive scheduler | **not present** | — |
| Temporal reprojection buffers for RT4D | **not present** | (`SampleAccumulator` is per-frame CPU only) |

## 1. Wavefront / path queues

**Intent (declared):** Introduce queue-based path management with ray queues per stage — gen, hit, shade, scatter — to reduce divergence and improve occupancy.

| | |
| --- | --- |
| **Milestone** | Replace per-pixel bounce loop with a queue-driven pipeline |
| **Declared outcome** | Higher GPU utilization; better scaling with resolution and depth (**target**, not measured) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. Define queue buffer layouts (capacity, compact/append semantics) shared across backends.  
2. Stage kernels that only consume their queue and emit into the next.  
3. Keep CPU packed traverse / HCL as parity oracles where feasible.  
4. Do not relabel today’s multi-dispatch sketch as “wavefront complete.”

## 2. Adaptive sampling

**Intent (declared):** Add per-pixel variance estimation and sample allocation.

| | |
| --- | --- |
| **Milestone** | Implement variance buffers + adaptive sample scheduler |
| **Declared outcome** | Fewer samples in flat regions; more in complex 4D features (caustics, folds, W-edges) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. Variance / second-moment buffers alongside color accumulation.  
2. Scheduler that reallocates spp under a frame budget.  
3. Validation scenes (HCL and successors) for caustic / fold stress — measurements **TBD**.

## 3. Temporal accumulation

**Intent (declared):** Track history across frames (color, variance, motion / 4D reprojection hints).

| | |
| --- | --- |
| **Milestone** | Introduce temporal buffers + reprojection pass |
| **Declared outcome** | Faster convergence for camera moves and animated scenes (**target**) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. History color + variance + validity masks.  
2. Reprojection using camera / 4D motion hints (exact W-axis encoding **declared** until specified).  
3. Hand off stability hardening (ghosting, clamping) to [v3](./RT4D_V3_IMAGE_QUALITY.md).

## Exit criteria for calling v2.0 “landed” (future)

All of the following must gain **code + test** evidence before upgrading status tags:

- [ ] Queue-driven stages replace the primary GPU bounce loop for a documented scene path  
- [ ] Variance buffers drive measurable adaptive allocation (test or benchmark receipt)  
- [ ] Temporal buffers + reprojection pass produce history-aware frames under a scripted camera move  

Until then, keep status **roadmap**.

## Cross-links

- BVH GPU substrate: [`docs/4drs/substrate/BVH4D_GPU.md`](../../4drs/substrate/BVH4D_GPU.md)  
- FourDRenderer v2 shading/transport (related contracts): [`../v2/shading-transport/SHADING_AND_TRANSPORT_RFC.md`](../v2/shading-transport/SHADING_AND_TRANSPORT_RFC.md)  
- Next: [`RT4D_V3_IMAGE_QUALITY.md`](./RT4D_V3_IMAGE_QUALITY.md)
