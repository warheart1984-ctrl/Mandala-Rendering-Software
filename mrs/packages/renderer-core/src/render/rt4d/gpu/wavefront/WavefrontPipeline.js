import { createRhi } from "../../../rhi/RhiFactory.js";
import { GpuWavefrontQueue } from "./WavefrontQueue.js";
import { StubWavefrontKernels, RealWavefrontKernels } from "./WavefrontKernels.js";
import { DefaultWavefrontScheduler } from "./WavefrontScheduler.js";
import { WavefrontDenoiser } from "./WavefrontDenoiser.js";
import { WavefrontEvidence } from "./WavefrontEvidence.js";
import { BindGroupManager } from "../bindGroupManager.js";
import { BufferPool, StagingBuffer } from "../bufferPool.js";
import { serializeScene } from "../sceneSerializer.js";

/**
 * @typedef {object} WavefrontKernelContext
 * @property {import("../../../rhi/RhiContract.js").Rhi | null} [rhi]
 * @property {import("../../../rhi/RhiTypes.js").RhiDeviceInfo | object} [device]
 * @property {GPUDevice} [gpuDevice]
 * @property {import("../../../rhi/RhiTypes.js").RhiTextureHandle} [frameTexture]
 * @property {import("../../../rhi/RhiTypes.js").RhiBufferHandle} [pathBuffer]
 * @property {import("../../../rhi/RhiTypes.js").RhiBufferHandle} [worldBuffer]
 */

/**
 * Ensure WebGPU usage enums exist (Node mock / browser).
 */
export function ensureGpuGlobals() {
  if (typeof globalThis.GPUBufferUsage === "undefined") {
    globalThis.GPUBufferUsage = {
      MAP_READ: 1,
      MAP_WRITE: 2,
      COPY_SRC: 4,
      COPY_DST: 8,
      INDEX: 16,
      VERTEX: 32,
      UNIFORM: 64,
      STORAGE: 128,
      INDIRECT: 256,
      QUERY_RESOLVE: 512,
    };
  }
  if (typeof globalThis.GPUMapMode === "undefined") {
    globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
  }
  if (typeof globalThis.GPUShaderStage === "undefined") {
    globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  }
}

/**
 * Dual-signature factory:
 *   createRt4dWavefrontPipeline("webgpu", opts)
 *   createRt4dWavefrontPipeline({ scene, camera, gpuDevice, ... })
 *
 * Real path when `gpuDevice` is provided, or scene+camera with live navigator.gpu.
 * Otherwise stub RHI path (Node CI / conformance).
 *
 * @param {import("../../../rhi/RhiTypes.js").RhiBackend | object} [backendOrOpts]
 * @param {object} [options]
 */
export async function createRt4dWavefrontPipeline(backendOrOpts = "webgpu", options = {}) {
  let backend = "webgpu";
  let opts = options;
  if (typeof backendOrOpts === "object" && backendOrOpts !== null) {
    opts = backendOrOpts;
    backend = opts.backend ?? "webgpu";
  } else if (typeof backendOrOpts === "string") {
    backend = backendOrOpts;
  }

  if (shouldCreateRealPipeline(opts)) {
    return _createRealPipeline(opts);
  }
  return _createStubPipeline(backend, opts);
}

/**
 * @param {object} options
 */
function shouldCreateRealPipeline(options) {
  if (options.forceStub === true) return false;
  if (options.gpuDevice) return true;
  if (!options.scene || !options.camera) return false;
  if (options.allowLiveGpu === false) return false;
  return typeof globalThis.navigator !== "undefined" && !!globalThis.navigator?.gpu;
}

/**
 * Stub / RHI conformance path (Phase B).
 * @param {string} backend
 * @param {object} options
 */
async function _createStubPipeline(backend, options) {
  const width = options.width ?? 8;
  const height = options.height ?? 8;
  const seed = options.seed ?? 0x4d5253;

  const rhi =
    options.rhi ??
    createRhi(backend, {
      allowLiveGpu: options.forceStub ? false : options.allowLiveGpu,
      frameWidth: width,
      frameHeight: height,
      seed,
      // forceStub must stay on the in-memory RHI path (ignore injected devices).
      gpuDevice: options.forceStub ? undefined : options.gpuDevice,
    });

  const device = await rhi.selectDevice();
  const frameTexture = await rhi.createTexture(width, height, "rgba8");
  const pathBuffer = await rhi.createBuffer(Math.max(1024, width * height * 4), "storage");
  const worldBuffer = await rhi.createBuffer(1024, "storage");

  const queue = new GpuWavefrontQueue();
  const kernels = new StubWavefrontKernels(rhi, { width, height });
  const evidence = new WavefrontEvidence({ write: options.onEvidence, seed });
  const denoiser = new WavefrontDenoiser();

  const makeContext = () => ({
    rhi,
    device,
    frameTexture,
    pathBuffer,
    worldBuffer,
  });

  const scheduler = new DefaultWavefrontScheduler({
    kernels,
    evidence,
    denoiser,
    makeContext,
  });

  return {
    mode: rhi.mode ?? "stub",
    rhi,
    queue,
    evidence,
    width,
    height,
    kernels,
    get dispatchLog() {
      return rhi.dispatchLog ?? [];
    },
    /**
     * @param {string} _worldId
     * @param {import("./WavefrontConfig.js").WavefrontConfig} config
     */
    async renderFrame(_worldId, config) {
      if (config.enableMultiGpu) {
        evidence.records.push({
          note: "enableMultiGpu ignored in Phase B (deferred to RT4D v4)",
        });
      }
      queue.clear();
      queue.enqueueGenerate([
        {
          id: 0,
          pixelX: 0,
          pixelY: 0,
          dimension4: 0,
          depth: 0,
          throughput: [1, 1, 1, 1],
          terminated: false,
        },
      ]);
      await scheduler.runFrame(config);
      if (typeof rhi.ensureFrameReadback === "function") {
        await rhi.ensureFrameReadback();
      }
    },
    /** @returns {Promise<Uint8ClampedArray>} */
    async getPixels() {
      if (typeof rhi.getFramePixels === "function") {
        return rhi.getFramePixels();
      }
      return new Uint8ClampedArray(width * height * 4);
    },
  };
}

/**
 * Real WebGPU path — device + scene serialization + ray buffers + readback.
 * Status: partial (mock-tested; needs browser WebGPU validation).
 * @param {object} options
 */
async function _createRealPipeline(options) {
  ensureGpuGlobals();

  const width = options.width ?? options.camera?.width ?? 8;
  const height = options.height ?? options.camera?.height ?? 8;
  const seed = options.seed ?? 0x4d5253;

  let device = options.gpuDevice ?? null;
  if (!device) {
    if (!globalThis.navigator?.gpu) {
      throw new Error("Real wavefront pipeline requires gpuDevice or navigator.gpu");
    }
    const adapter = await globalThis.navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) throw new Error("No WebGPU adapter");
    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: 1 << 26,
        maxBindGroups: 4,
        maxComputeWorkgroupStorageSize: 16384,
      },
    });
  }

  const bindGroupMgr = new BindGroupManager(device);
  const bufferPool = new BufferPool(device);
  const staging = new StagingBuffer(device, bufferPool);

  const scene = options.scene ?? {
    primitives: [],
    lights: [],
    materials: { listIds: () => [], get: () => ({ params: {} }) },
  };
  const camera = options.camera ?? {
    position: { x: 0, y: 0, z: -3, w: 0 },
    width,
    height,
    fovX: 60,
    fovY: 45,
    fovZ: 45,
    fovW: 30,
  };

  const sceneBuffers = serializeScene(scene, device, {
    ...camera,
    width: camera.width ?? width,
    height: camera.height ?? height,
  });

  const rayBuffers = allocateRayBuffers(device, width, height);
  const frameParamsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const accumBuffer = device.createBuffer({
    size: Math.max(16, width * height * 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const outputBuffer = device.createBuffer({
    size: Math.max(16, width * height * 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const kernels = new RealWavefrontKernels(device, {
    width,
    height,
    bindGroupMgr,
    sceneBuffers,
    rayBuffers,
    frameParamsBuffer,
    accumBuffer,
    outputBuffer,
  });

  const evidence = new WavefrontEvidence({ write: options.onEvidence, seed });
  const denoiser = new WavefrontDenoiser();
  const queue = new GpuWavefrontQueue();

  const makeContext = () => ({
    rhi: null,
    gpuDevice: device,
    device: {
      id: 0,
      name: "webgpu-real",
      backend: "webgpu",
      supportsRayTracing: false,
      supportsMultiGpu: false,
    },
    frameTexture: null,
    pathBuffer: null,
    worldBuffer: null,
  });

  const scheduler = new DefaultWavefrontScheduler({
    kernels,
    evidence,
    denoiser,
    makeContext,
  });

  /** Proxy so adapter can read `pipeline.rhi.dispatchLog` / `rhi.mode`. */
  const rhiProxy = {
    mode: "live",
    get dispatchLog() {
      return kernels.dispatchLog;
    },
  };

  return {
    mode: "live",
    rhi: rhiProxy,
    queue,
    evidence,
    width,
    height,
    kernels,
    get dispatchLog() {
      return kernels.dispatchLog;
    },
    /**
     * @param {string} _worldId
     * @param {import("./WavefrontConfig.js").WavefrontConfig} config
     */
    async renderFrame(_worldId, config) {
      if (config.enableMultiGpu) {
        evidence.records.push({
          note: "enableMultiGpu ignored (deferred to RT4D v4)",
        });
      }
      kernels.dispatchLog.length = 0;
      queue.clear();
      const cfg = {
        ...config,
        maxDepth: options.maxDepth ?? config.maxDepth,
        samplesPerPixel: options.samplesPerPixel ?? config.samplesPerPixel,
        seed,
      };
      await scheduler.runFrame(cfg);
    },
    /** @returns {Promise<Uint8ClampedArray>} */
    async getPixels() {
      const n = width * height;
      const size = n * 16;
      try {
        const data = await staging.readback(outputBuffer, size);
        const pixels = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
          const o = i * 4;
          pixels[o] = Math.min(255, Math.max(0, data[o] * 255));
          pixels[o + 1] = Math.min(255, Math.max(0, data[o + 1] * 255));
          pixels[o + 2] = Math.min(255, Math.max(0, data[o + 2] * 255));
          pixels[o + 3] = 255;
        }
        return pixels;
      } catch {
        // Mock devices may lack full map/readback — return empty frame.
        return new Uint8ClampedArray(n * 4);
      }
    },
  };
}

/**
 * @param {GPUDevice} device
 * @param {number} width
 * @param {number} height
 */
function allocateRayBuffers(device, width, height) {
  const n = width * height;
  const vec4Size = Math.max(16, n * 16);
  const f32Size = Math.max(4, n * 4);
  const hitSize = Math.max(32, n * 32);
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const make = (size) => device.createBuffer({ size, usage });

  return {
    rayOrigins: make(vec4Size),
    rayDirs: make(vec4Size),
    rayTMin: make(f32Size),
    rayTMax: make(f32Size),
    hits: make(hitSize),
    rayOriginsOut: make(vec4Size),
    scatterDirs: make(vec4Size),
    pathThroughput: make(vec4Size),
  };
}
