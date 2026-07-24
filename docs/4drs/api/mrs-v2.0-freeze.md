# MRS / RT4D architectural freeze — v2.0

**Freeze date:** 2026-07-24  
**Product:** MRS v2.0 (umbrella) · RT4D GPU / RHI / wavefront contract generation  
**Import root:** `mrs/packages/renderer-core/src/render/rt4d/` (+ `../rhi/`)  
**Package:** `@mrs/renderer-core` (`./rt4d` export)

> **What “freeze” means here (Drive-G-1):** the **declared contracts**, **module paths**, and **public export names** listed below are the v2.0 surface. Breaking renames or silent removal of these names require a **post-v2.0** major bump or a new freeze doc.  
> Freeze does **not** mean wavefront path tracing, multi-GPU, Vulkan/DX12, or full curvature physics are production-complete. Many exports are **stubs / skeletons** with documented maturity.

**Companion:** CPU RT4D v1.0 API freeze remains in force — [`rt4d-v1.0-freeze.md`](./rt4d-v1.0-freeze.md).  
**Umbrella:** [`../roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md`](../roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md)

---

## Frozen contract documents

| Document | Role at freeze |
| --- | --- |
| [`docs/4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md`](../roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md) | Umbrella phases A–C+ |
| [`docs/4d-engine/rt4d/RT4D_V2_GPU_CORE.md`](../../4d-engine/rt4d/RT4D_V2_GPU_CORE.md) | GPU core intent |
| [`docs/4d-engine/rt4d/RT4D_V2_WAVEFRONT_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V2_WAVEFRONT_CONTRACT.md) | Wavefront queues / stages |
| [`docs/4d-engine/rt4d/RT4D_V2_RHI_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V2_RHI_CONTRACT.md) | RHI façade |
| [`docs/4d-engine/rt4d/RT4D_V2_MATH_NOTES.md`](../../4d-engine/rt4d/RT4D_V2_MATH_NOTES.md) | Math notes |
| [`docs/4d-engine/rt4d/RT4D_V4_MULTI_GPU_CONTRACT.md`](../../4d-engine/rt4d/RT4D_V4_MULTI_GPU_CONTRACT.md) | Multi-GPU (declared) |
| [`docs/4d-engine/v2/WorldDocument-v2.md`](../../4d-engine/v2/WorldDocument-v2.md) | WorldDocument v2 fields |
| [`docs/4d-engine/v2/PLP-v2.md`](../../4d-engine/v2/PLP-v2.md) | PLP v2 + wave |
| [`constitution/CKL_MULTI_GPU.md`](../../../constitution/CKL_MULTI_GPU.md) | Multi-GPU policy (**declared**, not a runtime gate) |
| [`cssv/rt4d/cssv-wavefront-schema.json`](../../../cssv/rt4d/cssv-wavefront-schema.json) | Wavefront CSSV schema |
| [`schemas/world-document-v2.json`](../../../schemas/world-document-v2.json) | WorldDocument v2 schema |

Contract **text** may gain clarifying non-claims; removing a frozen requirement without a superseding freeze is a breaking change.

---

## Frozen package export map (v2 additions)

v1 module paths remain frozen. v2 **adds** these public surfaces (via `@mrs/renderer-core/rt4d` barrel and/or direct paths under `src/render/`):

| Area | Path | Maturity at freeze |
| --- | --- | --- |
| RHI façade | `src/render/rhi/` | WebGPU **partial** (live + stub); Vulkan/DX12 **declared** (throw-on-use) |
| Wavefront | `src/render/rt4d/gpu/wavefront/` | **partial stubs** + WGSL sources **declared** |
| Pipeline adapters | `src/render/rt4d/pipeline/` | **partial** (record-optional conformance) |
| Physics helpers | `src/render/rt4d/physics/` | **skeleton** (CPU) |
| World / PLP | `WorldOrchestrator.js`, `world/`, `plp/` | **skeleton** |
| Frame loop | `FrameLoop.js` | **skeleton** |
| Gallery HDR helper | `gallery/HdrCanvas.js` | **partial** helper |

---

## Frozen public exports (v2 names)

Stable names on `@mrs/renderer-core/rt4d` (in addition to the v1.0 freeze list):

### RHI

`createRhi`, `WebGpuRhi`, `VulkanRhi`, `Dx12Rhi`, `MultiGpuArbitrator`, `RHI_BACKENDS`

### Wavefront

`createRt4dWavefrontPipeline`, `GpuWavefrontQueue`, `WAVEFRONT_QUALITY_DEFAULTS`, `DefaultWavefrontScheduler`, `StubWavefrontKernels`, `WavefrontDenoiserStub`, `WavefrontEvidence`, `WAVEFRONT_WGSL`, `WAVE_UPDATE_WGSL`

### Pipeline / entry

`renderRT4DFrameWavefront`, `renderWavefrontFrame`, `selectWavefrontConfig`, `selectQualityProfile`, `selectConformanceProfile`, `runCPUConformanceGate`, `buildTinyReferenceFrame`, `hashBytes`, `createWavefrontCssvWriter`

### Physics / world / loop

`CurvatureField`, `ForceField`, `WaveField`, `fromWorldWaveConfig`, `stepWaveField`, `prepareWorld`, `bindWorld`, `validateWorldDocumentV2`, `PlpValidator`, `FrameLoop`, `HdrCanvas`

Also retained: `renderRT4DFrame`, `renderRT4DFrameGPU`, `RT4DGPURenderer` (GPU path remains **skeleton** / multi-dispatch, not full wavefront path tracing).

---

## Frozen phase boundaries

| Phase | Frozen meaning |
| --- | --- |
| **A** | Docs + declared contracts — **closed** for v2.0 freeze |
| **B** | WebGPU RHI + wavefront interfaces + CPU conformance spike — **landed as stubs/partial**; further work is **post-freeze** enhancement, not silent scope expand into “implemented path tracer” |
| **C** | Multi-GPU arbitrator, Vulkan/DX12 stubs, wave/curvature/force helpers, WorldBinding/FrameLoop, WD/PLP+wave — **scaffolding frozen**; live multi-GPU / native RHI = **C+ roadmap** |
| **C+** | Explicitly **not frozen as capability** — remains roadmap |

---

## Explicitly not frozen (may change without a new major freeze)

- Internal helpers local to files; WGSL kernel **bodies** (sources may evolve while stage names stay).  
- Stub frame contents (gradients / hashes), sample counts, RNG, performance.  
- `enforce*` CKL defaults (remain **record-optional** until writers + probes exist).  
- Genblaze Media app APIs / B2 ops (`docs/ops/*`) — separate product track; not RT4D freeze.  
- Host adapters (Unity/Unreal), Nanite/Lumen, commercial self-serve.

---

## Explicit non-claims at freeze

- [ ] Full GPU wavefront path tracing production-ready  
- [ ] Multi-GPU tile / split-frame live  
- [ ] Vulkan / DX12 RT4D backends usable  
- [ ] Full curvature tensors / continuum physics  
- [ ] CKL multi-GPU machine-enforced  
- [ ] Genblaze renders 4D  

---

## Scorecard

[`docs/scorecards/mrs-v2.md`](../../scorecards/mrs-v2.md) — refresh when claiming maturity upgrades; freeze does not auto-upgrade dimension ratings.
