# RT4D v2 — Wavefront path engine contract

> **Status:** **declared / roadmap** (Drive-G-1).  
> APIs below are **contracts**. Implementations in Phase B start as WebGPU-backed stubs + interfaces.  
> Do not describe today’s `RT4DGPURenderer` multi-dispatch loop as wavefront-complete.  
> Parent: [`RT4D_V2_GPU_CORE.md`](./RT4D_V2_GPU_CORE.md) · Umbrella: [`MRS_V2_ARCHITECTURAL_ROADMAP.md`](../../4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md)

## Planned file layout (`@mrs/renderer-core`)

```text
mrs/packages/renderer-core/src/render/rt4d/
  gpu/wavefront/
    WavefrontConfig.js
    WavefrontQueue.js
    WavefrontKernels.js
    WavefrontScheduler.js
    WavefrontDenoiser.js
    WavefrontPipeline.js
    WavefrontEvidence.js
  pipeline/
    WavefrontConfigSelector.js
    WavefrontPipelineAdapter.js
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

Stages: **generate → extend → shade → accumulate** (+ optional **denoise** stub).

```ts
interface PathState {
  id: number;
  pixelX: number;
  pixelY: number;
  dimension4: number;
  depth: number;
  throughput: [number, number, number, number];
  terminated: boolean;
}

interface WavefrontQueue {
  enqueueGenerate(batch: PathState[]): void;
  enqueueExtend(batch: PathState[]): void;
  enqueueShade(batch: PathState[]): void;
  enqueueAccumulate(batch: PathState[]): void;
  flush(): Promise<void>;
}
```

## Kernels (RHI-bound)

Kernels take an `Rhi` context — see [`RT4D_V2_RHI_CONTRACT.md`](./RT4D_V2_RHI_CONTRACT.md). They must not import Vulkan/DX12 types directly.

```ts
interface WavefrontKernels {
  launchGenerate(ctx: WavefrontKernelContext): Promise<void>;
  launchExtend(ctx: WavefrontKernelContext): Promise<void>;
  launchShade(ctx: WavefrontKernelContext): Promise<void>;
  launchAccumulate(ctx: WavefrontKernelContext): Promise<void>;
  launchDenoise?(ctx: WavefrontKernelContext): Promise<void>;
}
```

## Scheduler + pipeline entry

`DefaultWavefrontScheduler.runFrame(config)` runs stages in order and optionally calls the denoiser stub.  
`createRt4dWavefrontPipeline(backend)` wires queue + kernels + optional CSSV evidence writer.  
`WavefrontPipelineAdapter.renderWavefrontFrame(...)` is the `@mrs/renderer-core` host entry (browser / future native bridges).

## Evidence (record-optional in Phase B)

`WavefrontEvidenceRecord` may append stage timestamps + backend id into CSSV when a writer is configured. Missing writer **must not** fail the frame in Phase B.

Conformance selector fields (`enforceCurvatureEvidence`, etc.) default to **recording preference**, not hard enforcement, until CKL probes exist.

## Exit criteria (future “landed”)

- [ ] Queue-driven stages are the primary GPU path for a documented scene  
- [ ] CPU `PathTracer4D` conformance test passes within documented tolerance  
- [ ] Denoiser stub is swappable without changing scheduler API  

## Non-claims

- Wavefront queues are **not** implemented until Phase B+ code lands.  
- Denoiser stub is **not** a production denoiser.  
- Multi-GPU flags in config are **not** an implemented dispatcher.
