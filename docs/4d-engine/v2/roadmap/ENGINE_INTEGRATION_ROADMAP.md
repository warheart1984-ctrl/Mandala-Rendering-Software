# FourDRenderer v2.0 — Engine Integration Roadmap  
## Phases, Deliverables, Unreal Strategy

| Field | Value |
| --- | --- |
| Status | **Roadmap** (Phase 1 = **docs declared complete**) |
| Drive-G-1 | Phase 1 does **not** mean GPU complete |

## Phase 1 — Foundation (**docs complete**)

Deliverables (this suite):

- [x] 4D BVH & Projection RFC  
- [x] SO(4) BSDF / Shading & Transport RFC  
- [x] 4D path tracer contracts  
- [x] Observation Mode RFC  
- [x] Core architecture + whitepaper  
- [x] Render graph, Shader ABI, Materials  
- [x] Samples, validation, performance model  

**Explicit non-claim:** Phase 1 GPU kernels are **not** complete.

## Phase 2 — GPU implementation (**roadmap**)

Milestones: RayGen4D · Trace4D · Shade4D · PathTrace4D · Project4DTo3D · ObservationRouting.  

Deliverables: working compute pipeline (chosen backend), debug visualizations, 4D test scenes.  

Builds on existing **skeleton** CUDA/WGSL BVH sketches — does not pretend they already satisfy Phase 2.

## Phase 3 — Unreal integration (**roadmap**)

| Track | Intent |
| --- | --- |
| GBuffer | Inject `ShadingOutput3D` into deferred path |
| Path tracer | 4D radiance buffer + hybrid bounce |
| Lumen | Feed 4D GI as additional indirect (**roadmap**) |

**Boundary:** FourDAdapter v1.1 remains Scene3D + lineage consumer. Deep RHI is **not** adapter v1.1 scope — [`../../v1/adapters/UNREAL_ADAPTER_V1.md`](../../v1/adapters/UNREAL_ADAPTER_V1.md).

## Phase 4 — Tooling (**roadmap**)

- Material editor nodes for 4D  
- Sequencer track for `ObservationModeId`  
- 4D debugger viewport / W-axis visualization  

Some Unreal debugger / Sequencer skeletons exist under Engine v1 adapters — treat as **skeleton**, not Phase 4 complete.

## Phase 5 — Optimization (**roadmap**)

- 4D BVH compaction  
- Wavefront path tracing  
- Async compute scheduling  
- Temporal reprojection for 4D  

## Phase 6 — Productionization (**roadmap**)

- CI pipeline for v2 GPU / host gates  
- Engine build integration  
- Documentation suite maintenance  
- Sample scenes + performance benchmarks (measured, not design-only)

## Nanite / Lumen extensions (**roadmap**)

### Nanite (cluster awareness — not “Nanite is 4D”)

- Extend cluster bounds with W extents  
- Cull using 4D camera / W-slice  
- Optional pre-projection of clusters for some Observation Modes  
- Interop: 4D BVH and Nanite must agree on W-visibility  

Goal: make Nanite **W-aware enough not to fight projection** — not a claim of full 4D Nanite.

### Lumen GI

- Probes may carry W as an extra dimension  
- GI rays may query 4D BVH for tagged regions  
- Caches may store W-dependent lighting  
- Blend 3D Lumen with 4D GI per Observation Mode / material flags  

**Status:** **roadmap** only.

## Evidence

| Phase | Status |
| --- | --- |
| 1 (docs) | **declared complete** (this tree) |
| 2–6 | **roadmap** |
| Nanite / Lumen | **roadmap** |
| FourDAdapter hybrid | **skeleton** (v1) |
