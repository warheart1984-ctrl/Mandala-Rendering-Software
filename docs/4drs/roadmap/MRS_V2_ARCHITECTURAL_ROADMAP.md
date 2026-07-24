# MRS v2.0 — Architectural Roadmap

**Product:** SovereignX.CIEMS.Engine.RT4D — Four-Dimensional Constitutional Renderer  
**Status:** **roadmap / declared** (Drive-G-1)  
**Updated:** 2026-07-24

> This document is an **umbrella index**. It does **not** claim wavefront queues, multi-GPU, Vulkan/DX12 RT4D backends, full curvature tensors, Nanite/Lumen bridges, or a self-serve commercial platform are implemented. Upgrade a row only when code + tests (or schemas + probes) prove it.

## Relationship to other tracks

| Track | Role | Anchor |
| --- | --- | --- |
| RT4D GPU evolution | Path-tracer / GPU core (v2–v4) | [`docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](../../4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md) |
| FourDRenderer / hosts | Engine contracts, Unreal/Unity phases | [`docs/4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../../4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md) |
| Genblaze concept media | FLUX → B2 MVP (**not** 4D render) | [`docs/ops/GENBLAZE_MEDIA_V2_ROADMAP.md`](../../ops/GENBLAZE_MEDIA_V2_ROADMAP.md) |
| 4DRS v1.0 | Frozen CPU / API surface | [`docs/4drs/README.md`](../README.md) |

**Path remapping:** proposed `engine/rt4d/...` trees land under `@mrs/renderer-core` — see Phase B layout below. Do not fork a parallel engine root.

## Phases (evidence gates)

| Phase | Intent | Status |
| --- | --- | --- |
| **A** | Docs + declared contracts | **declared** |
| **B** | WebGPU wavefront interfaces + CPU conformance spike | **partial stubs** |
| **C** | Scaffolding: multi-GPU arbitrator, Vulkan/DX12 stubs, wave/curvature/force CPU helpers, WorldBinding/FrameLoop, WD/PLP+wave | **declared / skeleton / partial** |
| **C+** | Live multi-GPU, native RHI, full PLP enforcement | **roadmap** |

---

## I. Core engine evolution (RT4D v2.0+)

### 1. GPU wavefront path engine (v2)

| | |
| --- | --- |
| **Intent** | Queue-based path tracing: generate → extend → shade → accumulate; denoiser **stub** for v2.1 |
| **Planned paths** | `mrs/packages/renderer-core/src/render/rt4d/gpu/wavefront/*` |
| **Contracts** | [`RT4D_V2_GPU_CORE.md`](../../4d-engine/rt4d/RT4D_V2_GPU_CORE.md), [`RT4D_V2_WAVEFRONT_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V2_WAVEFRONT_CONTRACT.md) |
| **Status** | **roadmap** — today’s `RT4DGPURenderer` is multi-dispatch **skeleton**, not wavefront |

### 2. Multi-GPU dispatch (v4 scale)

| | |
| --- | --- |
| **Intent** | Device enumeration, SharedFrame / tile or split-frame arbitration, CSSV evidence |
| **Planned paths** | `mrs/.../render/rhi/MultiGpuArbitrator.js`, `cssv/multi-gpu/`, `constitution/CKL_MULTI_GPU.md` |
| **Contracts** | [`RT4D_V4_SCALE_AND_BACKENDS.md`](../../4d-engine/rt4d/RT4D_V4_SCALE_AND_BACKENDS.md), [`RT4D_V4_MULTI_GPU_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V4_MULTI_GPU_CONTRACT.md) |
| **Status** | **roadmap** — **not present** |

### 3. Unified RHI (Vulkan / DX12 / WebGPU)

| | |
| --- | --- |
| **Intent** | Abstract RT4D kernels behind one RHI; WebGPU first (Phase B); Vulkan/DX12 later |
| **Planned paths** | `mrs/packages/renderer-core/src/render/rhi/` |
| **Contracts** | [`RT4D_V2_RHI_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V2_RHI_CONTRACT.md) |
| **Status** | **roadmap** — WebGPU sketch exists inside RT4D GPU; RHI façade **not present** |

---

## II. Mathematical substrate (MRS-CRC v2)

| Theme | Planned work | Status | Anchor |
| --- | --- | --- | --- |
| Curvature engine | Geodesics, normals, curvature tensors (replace stub) | **roadmap** (stub today) | [`substrate/INSPECTOR_PROTOCOL.md`](../substrate/INSPECTOR_PROTOCOL.md) |
| 4D BVH v2 | GPU build + intersect kernels | **skeleton / partial** CPU; GPU **skeleton** | [`substrate/BVH4D_GPU.md`](../substrate/BVH4D_GPU.md) |
| 4D physics v2 | Force fields, particles, CKL determinism policies | **roadmap** (basic modules **partial**) | [`substrate/CONSTITUTIONAL_CONTRACTS.md`](../substrate/CONSTITUTIONAL_CONTRACTS.md) |

---

## III. Host stack v2 (Browser / Unity / Unreal)

| Host | Intent | Status |
| --- | --- | --- |
| Unity FourDAdapter v2 | PIE, Scene3D→Scene4D, SharedFrame | Adapter **skeleton**; v2 **roadmap** |
| Unreal FourDAdapter v2 | Nanite/Lumen bridge, PIE + lineage | Adapter **skeleton**; Nanite/Lumen **roadmap** |
| Browser host v2 | WebGPU lighting profiles, HDR, Inspector overlays | Canvas/WebGPU **partial**; Inspector v2 overlays **roadmap** |

Detail: [`ENGINE_INTEGRATION_ROADMAP.md`](../../4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md).

---

## IV. Constitutional layer v2 (CIEMS)

| Layer | Intent | Status |
| --- | --- | --- |
| CSSV v2 | Frame evidence for curvature, physics, RHI, multi-GPU | Host CSSV **partial**; v2 fields **declared / roadmap** |
| CQL v2 | Query domains for those evidence types | Interpreter **partial**; v2 domains **roadmap** |
| CKL v2 | Policies for GPU arbitration, physics determinism, surface validity | Policies **partial** on host; new articles **declared** until probes exist |

**Phase B rule:** evidence is **record-optional**. Do not default all `enforce*` flags to true until writers + probes exist (avoids policy theater).

---

## V. Storage + AI (Genblaze v2)

Separate product track — **not** named “RT4D v2.0”:

- Ops roadmap: [`docs/ops/GENBLAZE_MEDIA_V2_ROADMAP.md`](../../ops/GENBLAZE_MEDIA_V2_ROADMAP.md)
- Scorecard: [`docs/scorecards/genblaze-media.md`](../../scorecards/genblaze-media.md)

**Explicit non-claim:** Genblaze / NIM FLUX generate **2D concept stills**. MRS remains the 4D renderer. “4D cinematic export” stays **roadmap** until RT4D frame-export contracts exist.

---

## VI. World format v2.0

| Theme | Intent | Status |
| --- | --- | --- |
| WorldDocument v2 | Curvature, physics, RHI, lineage fields | Specs **declared** (v1); v2 **roadmap** |
| PLP v2 | `projectWorld` validation + constitutional inheritance | `projectWorld` **skeleton**; v2 **roadmap** |

---

## VII. Developer experience (DX) v2

| Theme | Intent | Status |
| --- | --- | --- |
| Native canvas v2 | GPU PNG/HDR export, 4D→2D presets | Canvas **partial**; HDR/GPU export **roadmap** |
| Gallery v2 | Curvature / physics / BVH overlays | Gallery tooling **partial**; overlays **roadmap** |
| Docs v2 | This umbrella + track sync + scorecards | **declared** (this land) |

---

## Phase B — First engineering slice (after docs)

**Scope (declared):**

1. RHI façade with **WebGPU** backend stub under `src/render/rhi/`.
2. Wavefront queue / scheduler / denoiser-stub **interfaces** under `src/render/rt4d/gpu/wavefront/`.
3. `WavefrontPipelineAdapter` + config selector (quality profiles; conformance **record-optional**).
4. Conformance check vs CPU `PathTracer4D` on a tiny scene (tolerance / hash gate).

**Out of Phase B:** multi-GPU, Vulkan/DX12 native plugins, CKL hard-fail, host adapter v2.

---

## Phase C — File scaffolding (declared / skeleton)

| Artifact | Path | Maturity |
| --- | --- | --- |
| MultiGpuArbitrator | `.../rhi/MultiGpuArbitrator.js` | **declared** (`"single"`) |
| Vulkan/Dx12 RHI | `VulkanRhi.js`, `Dx12Rhi.js` | **declared** (throw-on-use) |
| Wave/curvature/force | `.../rt4d/physics/` | **skeleton** (CPU; not B2) |
| WorldBinding / prepareWorld | `world/WorldBinding.js`, `WorldOrchestrator.js` | **skeleton** |
| PlpValidator | `rt4d/plp/PlpValidator.js` | **skeleton** (wave rules) |
| FrameLoop | `rt4d/FrameLoop.js` | **skeleton** (browser; Node tick-only) |
| WGSL kernels | `wavefront/kernels/*.wgsl` | **declared** |

Wave tiling across GPUs: **docs only** — not implemented.

---

## Explicit non-claims

- [ ] Wavefront / multi-GPU / Vulkan·DX RT4D backends implemented  
- [ ] Full curvature tensors / 4D continuum physics  
- [ ] Production Unreal Nanite / Lumen 4D  
- [ ] Bit-identical multi-host enforcement  
- [ ] “Full constitutional 4D cinematic platform” as **present** capability  
- [ ] Genblaze renders 4D worlds  

## Summary (Drive-G-1)

> MRS v2.0 **plans** a constitutional 4D cinematic platform: wavefront path tracing behind a host-agnostic RHI, eventual multi-GPU with CSSV evidence, richer MRS-CRC substrate, host adapters, and Genblaze concept-media. **Contracts and MVP media exist or are declared; the GPU / RHI / hosts / commercial factory remains early.**

## Scorecards

- [`docs/scorecards/rt4d.md`](../../scorecards/rt4d.md)  
- [`docs/scorecards/fourd-renderer-v2.md`](../../scorecards/fourd-renderer-v2.md)  
- [`docs/scorecards/4d-engine-v1.md`](../../scorecards/4d-engine-v1.md)  
- [`docs/scorecards/genblaze-media.md`](../../scorecards/genblaze-media.md)  
- [`docs/scorecards/mrs-v2.md`](../../scorecards/mrs-v2.md)  
