# RT4D v2 — RHI contract (WebGPU first)

> **Status:** **partial** (Drive-G-1).  
> Phase B **code spike landed** for `createRhi("webgpu")`: buffer/texture create, upload, `readBuffer` (mapAsync when live), and `dispatchKernel` with compute pipeline + bind groups when `navigator.gpu` is available; otherwise a deterministic CPU stub fills a gradient/hash frame.  
> Vulkan / DX12 backends remain **roadmap** (RT4D v4 / Engine Phase 3+) and throw on factory call.  
> Parent GPU core: [`RT4D_V2_GPU_CORE.md`](./RT4D_V2_GPU_CORE.md) · Scale: [`RT4D_V4_SCALE_AND_BACKENDS.md`](./RT4D_V4_SCALE_AND_BACKENDS.md)

## Planned layout

```text
mrs/packages/renderer-core/src/render/rhi/
  RhiTypes.js
  RhiContract.js      # JSDoc / typedef surface
  RhiFactory.js
  webgpu/WebGpuRhi.js   # Phase B: stub + optional live WebGPU
  vulkan/VulkanRhi.js   # roadmap — not Phase B
  dx12/Dx12Rhi.js       # roadmap — not Phase B
```

## Types (declared)

```ts
type RhiBackend = "vulkan" | "dx12" | "webgpu";

interface RhiDeviceInfo {
  id: number;
  name: string;
  backend: RhiBackend;
  supportsRayTracing: boolean;
  supportsMultiGpu: boolean;
}

interface RhiBufferHandle { id: number; size: number; }
interface RhiTextureHandle {
  id: number;
  width: number;
  height: number;
  format: "rgba8" | "rgba16f" | "rgba32f";
}
```

## Contract

```ts
interface Rhi {
  getBackend(): RhiBackend;
  getDevices(): Promise<RhiDeviceInfo[]>;
  selectDevice(deviceId?: number): Promise<RhiDeviceInfo>;
  createBuffer(size: number, usage: "storage" | "uniform"): Promise<RhiBufferHandle>;
  createTexture(
    width: number,
    height: number,
    format: RhiTextureHandle["format"]
  ): Promise<RhiTextureHandle>;
  uploadBuffer(handle: RhiBufferHandle, data: ArrayBufferView): Promise<void>;
  readBuffer(handle: RhiBufferHandle, target: ArrayBufferView): Promise<void>;
  dispatchKernel(
    kernelName: string,
    workgroupsX: number,
    workgroupsY: number,
    workgroupsZ: number,
    bindings: Record<string, RhiBufferHandle | RhiTextureHandle>
  ): Promise<void>;
}
```

Wavefront kernels call **only** this API.

## Factory

```ts
function createRhi(backend: RhiBackend, options?: object): Rhi;
```

Phase B: `createRhi("webgpu")` returns a WebGPU RHI (stub and/or live).  
Calling `vulkan` / `dx12` before backends exist must throw a clear “not implemented / roadmap” error.

## Host selection (illustrative — not shipped bridges)

| Host | Declared default |
| --- | --- |
| Browser | `webgpu` |
| Unity / Unreal native plugins | `vulkan` or `dx12` (**roadmap**) |

## Non-claims

- [ ] Vulkan RT4D RHI implemented  
- [ ] DX12 RT4D RHI implemented  
- [ ] Backend parity WebGPU ↔ Vulkan ↔ DX12 achieved  
- Host `VulkanRenderDevice` preview path is **not** this RT4D RHI.  
- Live WebGPU path is **optional** — headless CI uses the CPU stub.
