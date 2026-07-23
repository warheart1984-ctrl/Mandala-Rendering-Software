# RT4D GPU evolution roadmap (v2.0 / v3.0 / v4.0)

> **Drive-G-1:** This tree is a **declared / roadmap** index for evolving the RT4D ray/path core.  
> It does **not** claim that wavefront queues, adaptive sampling, temporal accumulation, 4D-aware denoising, multi-GPU dispatch, or Vulkan/DX12 RT4D backends are implemented unless an Evidence row says otherwise.

**Product track:** RT4D (*Ray Tracer for Four Dimensions*) — GPU / scale evolution beyond 4DRS v1.0  
**Distinct from:** [FourDRenderer v2 RFCs](../v2/README.md) (full renderer architecture, Observation Modes, host blend). RT4D evolution targets the **path-tracer / GPU core**; FourDRenderer v2 targets the broader engine contracts. They **align** and cross-link; they are not the same deliverable.

## Document map

| Document | Role | Status |
| --- | --- | --- |
| [RT4D_EVOLUTION_ROADMAP.md](./RT4D_EVOLUTION_ROADMAP.md) | Master index + status table | **declared / roadmap** |
| [RT4D_V2_GPU_CORE.md](./RT4D_V2_GPU_CORE.md) | Wavefront queues, adaptive sampling, temporal accumulation | **roadmap** |
| [RT4D_V3_IMAGE_QUALITY.md](./RT4D_V3_IMAGE_QUALITY.md) | 4D-aware denoising, advanced integrators, robust temporal | **roadmap** |
| [RT4D_V4_SCALE_AND_BACKENDS.md](./RT4D_V4_SCALE_AND_BACKENDS.md) | Multi-GPU, backend parity, engine integration tier | **roadmap** |
| Scorecard | [`docs/scorecards/rt4d.md`](../../scorecards/rt4d.md) | Drive-G-2 (mostly early / roadmap) |

## Version status table

| Version | Theme | Status | Code evidence today |
| --- | --- | --- | --- |
| **v1.0** (4DRS publish) | CPU path engine + API freeze + HCL | **partial** (CPU) · GPU **skeleton** | `PathTracer4D`, `BVH4D`, `renderRT4DFrame`; WebGPU orchestrator + WGSL/CUDA sketches |
| **v2.0** | GPU core: queues, adaptive spp, temporal | **roadmap** | Not present as wavefront/adaptive/temporal RT4D pipelines |
| **v3.0** | Image quality & stability | **roadmap** | CPU has limited MIS helpers; no integrated 4D denoiser |
| **v4.0** | Scale & backends | **roadmap** | WebGPU path **partial/skeleton**; Vulkan/DX RT4D backends **not present** |

## Evidence map — current vs roadmap

| Capability | Current evidence | Roadmap version |
| --- | --- | --- |
| CPU path tracer (`PathTracer4D` / `renderRT4DFrame`) | **partial** | Baseline for v2+ |
| CPU BVH4D build/traverse | **partial** | Baseline |
| Packed GPU-shaped CPU traverse + CUDA/WGSL sketches | **skeleton** — [`docs/4drs/substrate/BVH4D_GPU.md`](../../4drs/substrate/BVH4D_GPU.md), `native/cuda/rt4d/` | Feeds v2 GPU core |
| WebGPU multi-dispatch sketch (`RT4DGPURenderer`: raygen → BVH → shade → accumulate) | **skeleton / partial** — not wavefront queues | v2 replaces bounce-loop style with queues (**declared**) |
| Sample accumulator (per-frame CPU) | **partial** | v2 temporal buffers **roadmap** |
| Power-heuristic MIS helpers on CPU | **partial** | v3 pluggable / advanced MIS **roadmap** |
| Denoising (normals/albedo/depth/W) | **not present** | v3 **roadmap** |
| Multi-GPU dispatcher | **not present** | v4 **roadmap** |
| Vulkan / DX12 RT4D compute parity | **not present** (host `VulkanRenderDevice` is unrelated preview dispatch **skeleton**) | v4 **declared goal** |
| FourDAdapter consuming native RT4D backends | Adapter **skeleton** (Scene3D + lineage); no RT4D Vulkan/DX consume path | v4 engine integration tier **roadmap** |

## Relationship to other docs

| Track | Path | Relationship |
| --- | --- | --- |
| 4DRS / RT4D v1.0 publish | [`docs/4drs/`](../../4drs/README.md) | Frozen v1.0 surface; this roadmap **extends** beyond it |
| FourDRenderer v2 | [`docs/4d-engine/v2/`](../v2/README.md) | Related but distinct — architecture vs path-tracer GPU core |
| Engine integration (hosts) | [`docs/4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md) | Host RHI phases; RT4D v4 prepares native backends those hosts may later consume |
| Charter | [`constitution/CHARTER.md`](../../../constitution/CHARTER.md) | Evidence tags for what ships today |

## Non-claims (explicit)

- Wavefront / path queues are **not** implemented.
- Adaptive sampling and temporal reprojection for RT4D are **not** implemented.
- 4D-aware denoising is **not** implemented.
- Multi-GPU RT4D dispatch is **not** implemented.
- Backend parity (WebGPU ↔ Vulkan ↔ DX12) is a **declared goal**; Vulkan/DX RT4D stages are **not present**.
- Do not describe v2–v4 items as “production ready” or “enforced.”

## Softened outcomes language

Where milestone notes mention high image quality, prefer:

> **targets** production-quality appearance at low spp (**declared**)

not “production-grade images are delivered.”
