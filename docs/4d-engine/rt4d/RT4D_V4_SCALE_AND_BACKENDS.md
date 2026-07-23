# RT4D v4.0 — Scale & backends

> **Status:** **roadmap / declared** (Drive-G-1).  
> Backend parity is a **declared goal**: WebGPU RT4D path is **partial/skeleton** if present; Vulkan/DX12 RT4D backends are **not present**.  
> Master index: [`RT4D_EVOLUTION_ROADMAP.md`](./RT4D_EVOLUTION_ROADMAP.md).

**Scope:** Scale RT4D across devices and present a backend-agnostic core that hosts and engines can consume.  
**Distinct from:** FourDAdapter v1.x hybrid-first Scene3D + lineage (**skeleton**) — adapters today do **not** consume native RT4D Vulkan/DX backends.

## Current baseline (evidence)

| Piece | Status | Path / note |
| --- | --- | --- |
| WebGPU RT4D compute sketch | **skeleton / partial** | `RT4DGPURenderer` + WGSL |
| CUDA BVH kernel stubs | **skeleton** | `native/cuda/rt4d/`, `accel/gpu/` |
| Vulkan RT4D raygen/BVH/shade/accumulate | **not present** | Host `VulkanRenderDevice` is preview/dispatch **skeleton**, not RT4D parity |
| DirectX 12 RT4D compute pipelines | **not present** | — |
| Multi-GPU RT4D dispatcher | **not present** | — |
| FourDAdapter → native RT4D backend | **not present** | Unity/Unreal FourDAdapter = Scene3D + lineage **skeleton** |

## 1. Multi-GPU rendering

**Intent (declared):** Split work by tiles, samples, or worlds across GPUs.

| | |
| --- | --- |
| **Milestone** | RT4D dispatcher that can target N devices and merge results |
| **Declared outcome** | Cluster / offline rendering for high-end 4D scenes (**target**) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. Work partitioning policy (tile / sample / world) as a documented contract.  
2. Merge / reduce of radiance (and optional AOV) buffers with deterministic ordering rules.  
3. Single-GPU path remains the default until N-device evidence exists.

## 2. Backend parity (WebGPU ↔ Vulkan ↔ DirectX)

**Intent (declared):** Abstract RT4D core into a backend-agnostic layer (command encoding, buffer management, shader modules).

| Milestone | Status |
| --- | --- |
| Vulkan backend with identical raygen / BVH / shade / accumulate stages | **roadmap** — **not present** |
| DirectX 12 backend with compute pipelines mirroring WebGPU | **roadmap** — **not present** |
| Declared outcome: same RT4D engine in browser, native desktop, and later engine plugins | **declared goal** |

### Honest parity statement

| Backend | Today | v4 goal |
| --- | --- | --- |
| WebGPU | **partial / skeleton** path-tracer orchestrator | Stabilize as reference compute stages |
| Vulkan | **not present** for RT4D stages | Parity with WebGPU stage set (**declared**) |
| DX12 | **not present** | Parity with WebGPU stage set (**declared**) |

Do not claim “backend parity achieved” until each backend has matching stage coverage **and** a recorded parity test.

## 3. Engine integration tier

**Intent (declared):** Stable API for external engines to consume RT4D outputs (GBuffer, light fields, volumetric slices).

| | |
| --- | --- |
| **Milestone** | FourDAdapter v1.x using Vulkan/DX backend for Unreal (**declared / planned**) |
| **Status** | **roadmap** |

### Planned work (not claimed done)

1. Output surface contracts (GBuffer / light-field / volumetric slice) versioned separately from Scene3D hybrid-first.  
2. FourDAdapter remains hybrid-first until native backends exist; then **may** consume them — do not invent a claim that adapters already do.  
3. Align naming with [`../v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md) without conflating RT4D backends with Unreal RHI 4D domain work.

## Exit criteria for calling v4.0 “landed” (future)

- [ ] Documented multi-GPU dispatcher with merge tests on ≥2 devices (or recorded CI substitute)  
- [ ] Vulkan **and** DX12 backends implement the same stage set as the WebGPU reference, with parity receipts  
- [ ] Published consume API + at least one host path (FourDAdapter or equivalent) reading native RT4D outputs  

Until then, keep status **roadmap**.

## Cross-links

- Prior: [`RT4D_V3_IMAGE_QUALITY.md`](./RT4D_V3_IMAGE_QUALITY.md)  
- FourDRenderer v2 index: [`../v2/README.md`](../v2/README.md)  
- Host adapter indexes: [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../v1/adapters/UNREAL_ADAPTER_V1.md), [`../v1/adapters/UNITY_ADAPTER_V1.md`](../v1/adapters/UNITY_ADAPTER_V1.md)  
- Scorecard: [`docs/scorecards/rt4d.md`](../../scorecards/rt4d.md)
