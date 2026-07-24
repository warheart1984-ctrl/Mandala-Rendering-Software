/**
 * WebGPU RHI (Phase B).
 *
 * - Headless / Node: in-memory buffers + CPU stub kernels (gradient/hash frame).
 * - Browser with navigator.gpu: real compute pipelines, bind groups, mapAsync readback.
 *
 * Vulkan/DX12 are not implemented here — use createRhi() factory errors.
 *
 * @implements {import("../RhiContract.js").Rhi}
 */

/** @type {Record<string, string>} */
const DEFAULT_KERNEL_WGSL = {
  rt4d_wavefront_generate: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  let h = (gid.x * 374761393u) ^ (gid.y * 668265263u) ^ params.seed;
  frame[i] = (255u << 24u) | ((h & 0xffu) << 16u) | (((gid.x * 255u) / max(params.width, 1u)) << 8u) | ((gid.y * 255u) / max(params.height, 1u));
  if (i < arrayLength(&paths)) { paths[i] = h; }
}
`,
  rt4d_wavefront_extend: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  var c = frame[i];
  c = c ^ (params.stage * 0x9e3779b9u);
  frame[i] = c;
  if (i < arrayLength(&paths)) { paths[i] = paths[i] ^ c; }
}
`,
  rt4d_wavefront_shade: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  let r = (frame[i] >> 16u) & 0xffu;
  let g = (frame[i] >> 8u) & 0xffu;
  let b = frame[i] & 0xffu;
  let lit = min(255u, (r + g + b) / 3u + 16u);
  frame[i] = (255u << 24u) | (lit << 16u) | (g << 8u) | b;
}
`,
  rt4d_wavefront_accumulate: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  // Pass-through accumulate stub — keeps prior stage RGBA packed in frame.
  frame[i] = frame[i];
}
`,
  rt4d_wavefront_denoise: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  frame[i] = frame[i];
}
`,
  rt4d_wavefront_denoise_stub: /* wgsl */ `
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  frame[i] = frame[i];
}
`,
};

const STAGE_IDS = Object.freeze({
  rt4d_wavefront_generate: 1,
  rt4d_wavefront_extend: 2,
  rt4d_wavefront_shade: 3,
  rt4d_wavefront_accumulate: 4,
  rt4d_wavefront_denoise: 5,
  rt4d_wavefront_denoise_stub: 5,
});

export class WebGpuRhi {
  /**
   * @param {object} [options]
   * @param {boolean} [options.allowLiveGpu] — attempt navigator.gpu when true (default true)
   * @param {GPUDevice} [options.gpuDevice] — inject a device (tests / hosts)
   * @param {number} [options.frameWidth]
   * @param {number} [options.frameHeight]
   * @param {number} [options.seed] — deterministic stub seed
   */
  constructor(options = {}) {
    this._nextId = 1;
    /** @type {import("../RhiTypes.js").RhiDeviceInfo|null} */
    this._deviceInfo = null;
    /** @type {GPUDevice|null} */
    this._gpuDevice = options.gpuDevice ?? null;
    this._allowLiveGpu = options.allowLiveGpu !== false;
    this._frameWidth = options.frameWidth ?? 8;
    this._frameHeight = options.frameHeight ?? 8;
    this._seed = options.seed ?? 0x4d5253;
    /** @type {"stub"|"live"} */
    this.mode = "stub";
    /** @type {Map<number, { id: number, size: number, usage: string, host: Uint8Array, gpu: GPUBuffer|null }>} */
    this._buffers = new Map();
    /** @type {Map<number, { id: number, width: number, height: number, format: string, host: Uint8Array, gpu: GPUBuffer|null }>} */
    this._textures = new Map();
    /** @type {Map<string, { code: string, entryPoint: string, pipeline: GPUComputePipeline|null }>} */
    this._kernels = new Map();
    /** @type {Array<{kernelName: string, x: number, y: number, z: number, mode: string}>} */
    this.dispatchLog = [];
    this._paramsGpu = null;
    this._bindGroupLayout = null;
    /** True when live GPU wrote frame storage that has not been mapped into host yet. */
    this._frameGpuDirty = false;

    for (const [name, code] of Object.entries(DEFAULT_KERNEL_WGSL)) {
      this.registerKernel(name, code);
    }
  }

  getBackend() {
    return /** @type {const} */ ("webgpu");
  }

  /**
   * @param {string} name
   * @param {string} wgsl
   * @param {string} [entryPoint]
   */
  registerKernel(name, wgsl, entryPoint = "main") {
    this._kernels.set(name, { code: wgsl, entryPoint, pipeline: null });
  }

  async getDevices() {
    if (this._allowLiveGpu && !this._gpuDevice) {
      await this._tryInitLiveGpu();
    }
    if (this._gpuDevice) {
      return [
        {
          id: 0,
          name: "WebGPU (live)",
          backend: /** @type {const} */ ("webgpu"),
          supportsRayTracing: false,
          supportsMultiGpu: false,
        },
      ];
    }
    return [
      {
        id: 0,
        name: "WebGPU (stub)",
        backend: /** @type {const} */ ("webgpu"),
        supportsRayTracing: false,
        supportsMultiGpu: false,
      },
    ];
  }

  async selectDevice(deviceId = 0) {
    const devices = await this.getDevices();
    const found = devices.find((d) => d.id === deviceId) ?? devices[0];
    this._deviceInfo = found;
    this.mode = this._gpuDevice ? "live" : "stub";
    return found;
  }

  async createBuffer(size, usage) {
    const id = this._nextId++;
    const host = new Uint8Array(Math.max(4, size));
    let gpu = null;
    if (this._gpuDevice) {
      const usageFlags =
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST |
        (usage === "uniform" ? GPUBufferUsage.UNIFORM : 0);
      gpu = this._gpuDevice.createBuffer({
        size: Math.max(4, size),
        usage: usageFlags,
      });
    }
    const handle = { id, size: Math.max(4, size) };
    this._buffers.set(id, { ...handle, usage, host, gpu });
    return handle;
  }

  async createTexture(width, height, format) {
    const id = this._nextId++;
    const bytesPerPixel = format === "rgba32f" ? 16 : format === "rgba16f" ? 8 : 4;
    const byteSize = Math.max(4, width * height * bytesPerPixel);
    const host = new Uint8Array(byteSize);
    let gpu = null;
    if (this._gpuDevice) {
      // Phase B stores packed RGBA as a storage buffer for compute stubs
      gpu = this._gpuDevice.createBuffer({
        size: Math.max(4, width * height * 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
    }
    const handle = { id, width, height, format };
    this._textures.set(id, { ...handle, host, gpu });
    this._frameWidth = width;
    this._frameHeight = height;
    return handle;
  }

  async uploadBuffer(handle, data) {
    const buf = this._buffers.get(handle.id);
    if (!buf) throw new Error(`Unknown buffer ${handle.id}`);
    const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    buf.host.set(src.subarray(0, Math.min(src.length, buf.host.length)));
    if (buf.gpu && this._gpuDevice) {
      this._gpuDevice.queue.writeBuffer(buf.gpu, 0, buf.host);
    }
  }

  async readBuffer(handle, target) {
    const buf = this._buffers.get(handle.id);
    if (!buf) throw new Error(`Unknown buffer ${handle.id}`);
    if (buf.gpu && this._gpuDevice) {
      await this._mapReadInto(buf.gpu, buf.host);
    }
    const view = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    view.set(buf.host.subarray(0, Math.min(view.length, buf.host.length)));
  }

  /**
   * Read texture storage (Phase B: packed RGBA8 in host/gpu buffer).
   * @param {import("../RhiTypes.js").RhiTextureHandle} handle
   * @param {ArrayBufferView} target
   */
  async readTexture(handle, target) {
    const tex = this._textures.get(handle.id);
    if (!tex) throw new Error(`Unknown texture ${handle.id}`);
    if (tex.gpu && this._gpuDevice) {
      await this._mapReadInto(tex.gpu, tex.host);
    }
    const view = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    view.set(tex.host.subarray(0, Math.min(view.length, tex.host.length)));
  }

  /**
   * @param {string} kernelName
   * @param {number} workgroupsX
   * @param {number} workgroupsY
   * @param {number} workgroupsZ
   * @param {Record<string, import("../RhiTypes.js").RhiBufferHandle|import("../RhiTypes.js").RhiTextureHandle>} bindings
   */
  async dispatchKernel(kernelName, workgroupsX, workgroupsY, workgroupsZ, bindings = {}) {
    this.dispatchLog.push({
      kernelName,
      x: workgroupsX,
      y: workgroupsY,
      z: workgroupsZ,
      mode: this.mode,
    });

    if (this.mode === "live" && this._gpuDevice) {
      await this._dispatchLive(kernelName, workgroupsX, workgroupsY, workgroupsZ, bindings);
      return;
    }
    this._dispatchStub(kernelName, bindings);
  }

  /**
   * Copy live GPU frame/path storage into the CPU host mirrors used by getFramePixels.
   * No-op in stub mode or when host already matches GPU.
   */
  async ensureFrameReadback() {
    if (!this._frameGpuDirty || !this._gpuDevice || this.mode !== "live") {
      return;
    }
    for (const tex of this._textures.values()) {
      if (tex.gpu) {
        await this._mapReadInto(tex.gpu, tex.host);
      }
    }
    for (const buf of this._buffers.values()) {
      if (buf.gpu) {
        await this._mapReadInto(buf.gpu, buf.host);
      }
    }
    this._frameGpuDirty = false;
  }

  /**
   * Decode packed RGBA8 host frame into clamped pixels.
   * Live path: maps GPU → staging → host first so callers see kernel output (not an empty buffer).
   * @returns {Promise<Uint8ClampedArray>}
   */
  async getFramePixels() {
    await this.ensureFrameReadback();
    for (const tex of this._textures.values()) {
      return this._decodeHostTexture(tex);
    }
    return new Uint8ClampedArray(0);
  }

  /**
   * @param {{ width: number, height: number, host: Uint8Array }} tex
   * @returns {Uint8ClampedArray}
   */
  _decodeHostTexture(tex) {
    const n = tex.width * tex.height;
    const out = new Uint8ClampedArray(n * 4);
    const u32 = new Uint32Array(
      tex.host.buffer,
      tex.host.byteOffset,
      Math.min(n, tex.host.byteLength >> 2)
    );
    for (let i = 0; i < n && i < u32.length; i++) {
      const c = u32[i] >>> 0;
      out[i * 4] = (c >>> 16) & 0xff;
      out[i * 4 + 1] = (c >>> 8) & 0xff;
      out[i * 4 + 2] = c & 0xff;
      out[i * 4 + 3] = (c >>> 24) & 0xff || 255;
    }
    return out;
  }

  async _tryInitLiveGpu() {
    try {
      const nav = typeof globalThis !== "undefined" ? globalThis.navigator : undefined;
      if (!nav?.gpu) return;
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) return;
      this._gpuDevice = await adapter.requestDevice();
      this.mode = "live";
    } catch {
      this._gpuDevice = null;
      this.mode = "stub";
    }
  }

  /**
   * @param {GPUBuffer} gpuBuf
   * @param {Uint8Array} host
   */
  async _mapReadInto(gpuBuf, host) {
    const device = this._gpuDevice;
    if (!device) return;
    const size = host.byteLength;
    const staging = device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuf, 0, staging, 0, size);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(staging.getMappedRange());
    host.set(mapped.subarray(0, host.length));
    staging.unmap();
    staging.destroy();
  }

  _ensureLivePipeline(kernelName) {
    const device = this._gpuDevice;
    const entry = this._kernels.get(kernelName);
    if (!device || !entry) {
      throw new Error(`Kernel not registered: ${kernelName}`);
    }
    if (entry.pipeline) return entry.pipeline;

    if (!this._bindGroupLayout) {
      this._bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        ],
      });
    }
    if (!this._paramsGpu) {
      this._paramsGpu = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    const module = device.createShaderModule({ code: entry.code });
    entry.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._bindGroupLayout] }),
      compute: { module, entryPoint: entry.entryPoint },
    });
    return entry.pipeline;
  }

  async _dispatchLive(kernelName, workgroupsX, workgroupsY, workgroupsZ, bindings) {
    const device = this._gpuDevice;
    const pipeline = this._ensureLivePipeline(kernelName);
    const frame = this._resolveTextureGpu(bindings.frame);
    const paths = this._resolveBufferGpu(bindings.paths) ?? this._resolveBufferGpu(bindings.world);
    if (!frame || !paths) {
      // Fall back to stub if bindings incomplete
      this._dispatchStub(kernelName, bindings);
      return;
    }

    const params = new Uint32Array([
      this._frameWidth,
      this._frameHeight,
      STAGE_IDS[kernelName] ?? 0,
      this._seed,
    ]);
    device.queue.writeBuffer(this._paramsGpu, 0, params);

    const bindGroup = device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this._paramsGpu } },
        { binding: 1, resource: { buffer: frame } },
        { binding: 2, resource: { buffer: paths } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.max(1, workgroupsX), Math.max(1, workgroupsY), Math.max(1, workgroupsZ));
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    this._frameGpuDirty = true;

    // After accumulate, read GPU frame into the CPU mirror getFramePixels returns.
    if (kernelName === "rt4d_wavefront_accumulate") {
      await this.ensureFrameReadback();
    }
  }

  _resolveBufferGpu(handle) {
    if (!handle) return null;
    return this._buffers.get(handle.id)?.gpu ?? null;
  }

  _resolveTextureGpu(handle) {
    if (!handle) return null;
    return this._textures.get(handle.id)?.gpu ?? null;
  }

  _dispatchStub(kernelName, bindings) {
    const stage = STAGE_IDS[kernelName] ?? 0;
    const texHandle = bindings.frame;
    const pathHandle = bindings.paths;
    const tex = texHandle ? this._textures.get(texHandle.id) : null;
    const pathBuf = pathHandle ? this._buffers.get(pathHandle.id) : null;
    const w = tex?.width ?? this._frameWidth;
    const h = tex?.height ?? this._frameHeight;
    const n = w * h;

    if (tex) {
      const u32 = new Uint32Array(tex.host.buffer, tex.host.byteOffset, Math.min(n, tex.host.byteLength >> 2));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (i >= u32.length) continue;
          if (stage <= 1) {
            const hash = (x * 374761393) ^ (y * 668265263) ^ this._seed;
            const r = hash & 0xff;
            const g = Math.floor((x * 255) / Math.max(w, 1));
            const b = Math.floor((y * 255) / Math.max(h, 1));
            u32[i] = ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0;
          } else if (stage === 2) {
            u32[i] = (u32[i] ^ ((stage * 0x9e3779b9) >>> 0)) >>> 0;
          } else if (stage === 3) {
            const c = u32[i] >>> 0;
            const r = (c >>> 16) & 0xff;
            const g = (c >>> 8) & 0xff;
            const b = c & 0xff;
            const lit = Math.min(255, Math.floor((r + g + b) / 3) + 16);
            u32[i] = ((255 << 24) | (lit << 16) | (g << 8) | b) >>> 0;
          }
          // accumulate / denoise: leave pixels
        }
      }
    }

    if (pathBuf) {
      const u32p = new Uint32Array(
        pathBuf.host.buffer,
        pathBuf.host.byteOffset,
        pathBuf.host.byteLength >> 2
      );
      for (let i = 0; i < Math.min(n, u32p.length); i++) {
        u32p[i] = (u32p[i] ^ (this._seed + stage + i)) >>> 0;
      }
    }
  }
}
