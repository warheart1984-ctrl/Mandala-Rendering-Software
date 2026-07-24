# RT4D v2 — Wavefront path engine contract

> **Status:** **partial** (Drive-G-1).  
> Phase B **code spike landed**: WebGPU RHI + wavefront queue/scheduler/kernels + CPU conformance gate (non-blocking) + optional CSSV writer.  
> This is **not** full path tracing — stub WGSL/CPU kernels produce a visible gradient/hash frame for plumbing tests.  
> Parent: [`RT4D_V2_GPU_CORE.md`](./RT4D_V2_GPU_CORE.md) · Umbrella: [`MRS_V2_ARCHITECTURAL_ROADMAP.md`](../../4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md)

## Phase B spike (landed — evidence-bound)

| Surface | Evidence |
| --- | --- |
| `createRhi("webgpu")` | In-memory stub + optional live `navigator.gpu` compute path |
| `createRhi("vulkan"\|"dx12")` | Throws clear roadmap error |
| Stages | `generate → extend → shade → accumulate` (+ denoiser stub) |
| Frame path | `renderWavefrontFrame` / `engineMode: "wavefront"` on `renderRT4DFrame*` |
| CPU gate | `runCPUConformanceGate` logs pass/fail; **non-blocking** |
| CSSV | `cssv/rt4d/cssv-wavefront-schema.json` + optional JSONL writer (not CKL-enforced) |
| Tests | `npm run test:wavefront` in `@mrs/renderer-core` (no GPU required) |

### How to call the adapter

```js
import { renderWavefrontFrame, renderRT4DFrame } from "@mrs/renderer-core/rt4d";

// Direct adapter
const frame = await renderWavefrontFrame("world-id", {
  quality: "baseline",
  host: "browser",
  width: 64,
  height: 64,
});

// Via existing render entry
const frame2 = await renderRT4DFrame(scene, camera, { engineMode: "wavefront", width: 64, height: 64 });
```

There is no `js/boot/renderer.js` wavefront hook in this spike — hosts should call the adapter above.

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
    kernels/{generate,extend,shade,accumulate}.wgsl
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

- [x] Phase B plumbing spike: RHI + stages + stub frame + CPU gate + tests  
- [ ] Queue-driven stages are the primary GPU path for a documented scene  
- [ ] CPU `PathTracer4D` conformance test passes within documented tolerance (full radiance, not hash stub)  
- [ ] Denoiser stub is swappable without changing scheduler API  

## Non-claims

- Wavefront stubs are **not** production path tracing.  
- Denoiser stub is **not** a production denoiser.  
- Multi-GPU flags in config are **not** an implemented dispatcher.  
- CKL does **not** enforce wavefront evidence in Phase B.  
- Vulkan / DX12 RHI backends are **not** implemented.
