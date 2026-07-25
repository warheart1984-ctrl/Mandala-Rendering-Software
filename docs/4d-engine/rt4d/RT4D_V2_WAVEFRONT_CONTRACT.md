# RT4D v2 — Wavefront path engine contract

> **Status:** **partial** (Drive-G-1).  
> Phase B stub RHI path remains the Node CI default.  
> Real WebGPU wavefront kernels (`RealWavefrontKernels`) reuse production WGSL (`RAYGEN_WGSL`, `BVH4D_WGSL_SOURCE`, `SHADE_WGSL`, `ACCUM_WGSL`) with batched multi-bounce scheduling — **mock-tested**; **not** claimed pixel-correct without a browser WebGPU device.  
> Parent: [`RT4D_V2_GPU_CORE.md`](./RT4D_V2_GPU_CORE.md) · Umbrella: [`MRS_V2_ARCHITECTURAL_ROADMAP.md`](../../4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md)

## Phase B + real kernels (evidence-bound)

| Surface | Evidence | Status |
| --- | --- | --- |
| `createRhi("webgpu")` stub | In-memory stub + optional live `navigator.gpu` | **tested** |
| `RealWavefrontKernels` | Pipelines from production WGSL; encoder-batched dispatches | **partial** (mock GPUDevice) |
| `DefaultWavefrontScheduler._runFrameBatched` | generate → (extend→shade→copy)×maxDepth → accumulate | **partial** (mock) |
| Stub stages | `generate → extend → shade → accumulate` (+ denoiser no-op) | **tested** |
| Frame path | `renderWavefrontFrame` / `engineMode: "wavefront"` | **tested** (stub) / **partial** (real) |
| CPU gate | `runCPUConformanceGate` logs pass/fail; **non-blocking** | **tested** (stub pixels) |
| CSSV | optional JSONL writer (not CKL-enforced) | **tested** |
| Tests | `npm run test:wavefront` in `@mrs/renderer-core` (no GPU required) | **tested** |

### How to call the adapter

```js
import { renderWavefrontFrame, renderRT4DFrame } from "@mrs/renderer-core/rt4d";

// Stub path (Node CI default)
const frame = await renderWavefrontFrame("world-id", {
  quality: "baseline",
  host: "browser",
  width: 64,
  height: 64,
});

// Real path when a GPUDevice is available (browser or injected mock)
const frameLive = await renderWavefrontFrame("world-id", {
  quality: "baseline",
  scene4D: scene,
  camera4D: camera,
  gpuDevice: device, // or rely on navigator.gpu + allowLiveGpu
  maxDepth: 4,
  samplesPerPixel: 1,
  runConformance: false,
});

// Via existing render entry
const frame2 = await renderRT4DFrame(scene, camera, {
  engineMode: "wavefront",
  width: 64,
  height: 64,
});
```

### Browser / real-device validation

Node CI has **no** WebGPU device. To validate on hardware:

1. Open a page that imports `@mrs/renderer-core` and calls `renderRT4DFrameWavefront(scene, camera, { allowLiveGpu: true })` (or pass an explicit `gpuDevice`).
2. Related worktree hint: `G:\New folder-wt-webgpu-readback` exercised RHI frame readback plumbing — use the same browser host pattern for wavefront.
3. Do **not** treat mock-passing tests as pixel-correct GPU output.

## Planned file layout (`@mrs/renderer-core`)

```text
mrs/packages/renderer-core/src/render/rt4d/
  gpu/wavefront/
    WavefrontConfig.js
    WavefrontQueue.js
    WavefrontKernels.js      # StubWavefrontKernels + RealWavefrontKernels
    WavefrontScheduler.js    # _runFrameLegacy + _runFrameBatched
    WavefrontDenoiser.js     # no-op { applied: false, stub: true }
    WavefrontPipeline.js     # dual-mode factory
    WavefrontEvidence.js
    kernels/{generate,extend,shade,accumulate}.wgsl  # stub RHI sources
  gpu/shaders.js             # production RAYGEN/SHADE/ACCUM WGSL (reused)
  accel/gpu/                 # BVH4D_WGSL_SOURCE (reused)
  pipeline/
    WavefrontConfigSelector.js
    WavefrontPipelineAdapter.js
    CPUConformanceGate.js
    WavefrontCssvWriter.js
```

Optional later CUDA sketches: `native/cuda/rt4d/wavefront/` (extend existing CUDA RT4D stubs).

## Config

```ts
type WavefrontQualityProfile = "baseline" | "high" | "ultra";

interface WavefrontConfig {
  maxDepth: number;
  samplesPerPixel: number;
  tileSize: number;
  quality: WavefrontQualityProfile;
  enableDenoiser: boolean;
  /** Record curvature-related evidence if a writer exists — not a CKL hard-fail in Phase B */
  enableCurvatureEvidence: boolean;
  /** Multi-GPU is RT4D v4; Phase B keeps this false */
  enableMultiGpu: boolean;
}
```

Quality profile defaults (**declared** targets, not measured SLAs):

| Profile | spp | maxDepth | tileSize | denoiser |
| --- | --- | --- | --- | --- |
| baseline | 1 | 4 | 32 | off |
| high | 4 | 6 | 16 | stub on |
| ultra | 8 | 8 | 8 | stub on |

## Queue model

Stages: **generate → extend → shade → accumulate** (+ optional **denoise** no-op).

Real batched order: **generate → (extend → shade → copyScatter)×maxDepth → accumulate** in one `GPUCommandEncoder` per sample.

## Kernels

```ts
interface WavefrontKernels {
  launchGenerate(ctxOrEncoder): Promise<void> | void;
  launchExtend(ctxOrEncoder): Promise<void> | void;
  launchShade(ctxOrEncoder): Promise<void> | void;
  launchAccumulate(ctxOrEncoder): Promise<void> | void;
  launchDenoise?(ctx): Promise<void>;
  copyScatterToRays?(encoder): void; // RealWavefrontKernels only
}
```

## Scheduler + pipeline entry

`DefaultWavefrontScheduler.runFrame(config)` routes to `_runFrameBatched` when `kernels.isBatched`, else `_runFrameLegacy`.  
`createRt4dWavefrontPipeline("webgpu", opts)` or `createRt4dWavefrontPipeline({ scene, camera, gpuDevice })` — dual-mode.  
`WavefrontPipelineAdapter.renderWavefrontFrame(...)` passes scene/camera/maxDepth/samplesPerPixel and returns `dispatchLog` + `rhiMode`.

## Evidence (record-optional in Phase B)

`WavefrontEvidenceRecord` may append stage timestamps + backend id into CSSV when a writer is configured. Missing writer **must not** fail the frame in Phase B.

## Exit criteria (future “landed”)

- [x] Phase B plumbing spike: RHI + stages + stub frame + CPU gate + tests  
- [x] Real kernel class + batched scheduler (mock GPUDevice)  
- [ ] Queue-driven stages are the primary GPU path for a documented scene on a real device  
- [ ] CPU `PathTracer4D` conformance test passes within documented tolerance (full radiance, not hash stub)  
- [x] Denoiser is swappable without changing scheduler API (no-op `{ applied: false, stub: true }`)

## Non-claims

- Mock-tested real kernels are **not** pixel-correct GPU validation.  
- Denoiser is **not** a production denoiser (`applied: false`).  
- Multi-GPU flags in config are **not** an implemented dispatcher.  
- CKL does **not** enforce wavefront evidence in Phase B.  
- Vulkan / DX12 RHI backends are **not** implemented.  
- Progressive multi-sample radiometric accumulation beyond pathThroughput→accum copy is **partial**.
