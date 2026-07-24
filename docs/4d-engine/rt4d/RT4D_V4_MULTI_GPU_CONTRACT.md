# RT4D v4 — Multi-GPU arbitration + CSSV metrics (contract)

> **Status:** **declared / roadmap** (Drive-G-1).  
> **Not** Phase B. Wavefront single-device WebGPU comes first.  
> Parent: [`RT4D_V4_SCALE_AND_BACKENDS.md`](./RT4D_V4_SCALE_AND_BACKENDS.md) · RHI: [`RT4D_V2_RHI_CONTRACT.md`](./RT4D_V2_RHI_CONTRACT.md)

## Planned layout

```text
mrs/packages/renderer-core/src/render/rhi/
  MultiGpuArbitrator.js
cssv/multi-gpu/
  cssv-multi-gpu-schema.json
  frames.ndjson                 # runtime artifact — gitignore locally
constitution/
  CKL_MULTI_GPU.md              # declared policy text
```

## Strategies (declared)

| Strategy | Behavior | Prefer when |
| --- | --- | --- |
| `single` | One eligible device | Default / fallback |
| `tiles` | Partition screen tiles across devices | Similar GPUs, latency |
| `split-frame` | Partition sample ranges; merge accumulation | High spp / uneven devices |

## Arbitrator API (declared)

```ts
interface MultiGpuDecision {
  frameId: string;
  selectedDevices: RhiDeviceInfo[];
  strategy: "single" | "split-frame" | "tiles";
}

interface MultiGpuArbitrator {
  decideDevices(rhi: Rhi, requestedCount: number): Promise<MultiGpuDecision>;
  recordDecision(decision: MultiGpuDecision): Promise<void>;
}
```

## CSSV evidence (declared schema fields)

Per frame:

- `frameId`, `strategy`, `decidedAt`
- `devices[]`: `id`, `name`, `backend`
- Optional perf: `tilesAssigned`, `samplesAssigned`, `renderTimeMs`, `utilization`
- Global: `totalRenderTimeMs`

## CKL policy intent (`CKL_MULTI_GPU.md` — declared)

Multi-GPU **may** be used only when:

1. At least two devices report `supportsRayTracing` (or a documented compute substitute),  
2. CSSV multi-GPU evidence is written per frame,  
3. Strategy is explicitly declared.

**Violation (planned):** fall back to `single` and record a fallback event.  
Until probes exist, this policy is **not** machine-enforced.

## Non-claims

- [ ] Multi-GPU dispatcher implemented  
- [ ] Tile / split-frame merge implemented  
- [ ] CKL multi-GPU enforcement live  
- [ ] Measured utilization metrics in production
