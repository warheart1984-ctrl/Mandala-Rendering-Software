/**
 * RT4D GPU Path Tracer — main orchestrator.
 * Multi-dispatch compute pipeline: raygen → BVH → shade (loop) → accumulate
 */
import { BufferPool, StagingBuffer } from "./bufferPool.js";
import { serializeScene } from "./sceneSerializer.js";
import { BindGroupManager } from "./bindGroupManager.js";
import { RAYGEN_WGSL, SHADE_WGSL, ACCUM_WGSL } from "./shaders.js";

// BVH WGSL is loaded from the accel/gpu module as a string
import { BVH4D_WGSL_SOURCE } from "../accel/gpu/index.js";

const WORKGROUP_SIZE = 64;

export class RT4DGPURenderer {
  constructor(options = {}) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 480;
    this.maxDepth = options.maxDepth ?? 4;
    this.samplesPerPixel = options.samplesPerPixel ?? 16;

    this.device = null;
    this.bindGroupMgr = null;
    this.bufferPool = null;
    this.sceneBuffers = null;

    this._pipelines = {};
    this._rayBuffers = null;
    this._frameParamsBuffer = null;
    this._accumBuffer = null;
    this._outputBuffer = null;
    this._staging = null;
  }

  async init(canvas) {
    if (!navigator?.gpu) throw new Error("WebGPU not available");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter");

    this.device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: 1 << 26,
        maxBindGroups: 4,
        maxComputeWorkgroupStorageSize: 16384,
      },
    });

    this.bindGroupMgr = new BindGroupManager(this.device);
    this.bufferPool = new BufferPool(this.device);
    this._staging = new StagingBuffer(this.device, this.bufferPool);

    await this._createPipelines();
    this._allocateRayBuffers();

    return this;
  }

  async _createPipelines() {
    const device = this.device;

    const raygenModule = device.createShaderModule({ code: RAYGEN_WGSL });
    const bvhModule = device.createShaderModule({ code: BVH4D_WGSL_SOURCE });
    const shadeModule = device.createShaderModule({ code: SHADE_WGSL });
    const accumModule = device.createShaderModule({ code: ACCUM_WGSL });

    this._pipelines.raygen = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupMgr.createRaygenLayout()],
      }),
      compute: { module: raygenModule, entryPoint: "main" },
    });

    this._pipelines.bvh = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupMgr.createBVHLayout()],
      }),
      compute: { module: bvhModule, entryPoint: "main" },
    });

    this._pipelines.shade = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupMgr.createShadeLayout()],
      }),
      compute: { module: shadeModule, entryPoint: "main" },
    });

    this._pipelines.accum = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupMgr.createAccumLayout()],
      }),
      compute: { module: accumModule, entryPoint: "main" },
    });
  }

  _pixelCount() {
    return this.width * this.height;
  }

  _allocateRayBuffers() {
    const n = this._pixelCount();
    const vec4Size = n * 16;
    const f32Size = n * 4;
    const hitSize = n * 32; // HitRecord: t(4) + primId(4) + materialId(4) + pad(4) + normal(16) = 32 bytes (vec4 alignment)
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;

    const make = (size) => this.device.createBuffer({ size: Math.max(4, size), usage });

    this._rayBuffers = {
      rayOrigins:     make(vec4Size),
      rayDirs:        make(vec4Size),
      rayTMin:        make(f32Size),
      rayTMax:        make(f32Size),
      hits:           make(hitSize),
      rayOriginsOut:  make(vec4Size),
      scatterDirs:    make(vec4Size),
      pathThroughput: make(vec4Size),
    };

    this._frameParamsBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._accumBuffer = this.device.createBuffer({
      size: vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this._outputBuffer = this.device.createBuffer({
      size: vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
  }

  serializeScene(scene, camera) {
    this.sceneBuffers = serializeScene(scene, this.device, camera);
  }

  async render(scene, camera, options = {}) {
    if (!this.device) await this.init();
    if (!this.sceneBuffers) this.serializeScene(scene, camera);

    const samples = options.samples ?? this.samplesPerPixel;
    const maxDepth = options.maxDepth ?? this.maxDepth;
    const width = options.width ?? this.width;
    const height = options.height ?? this.height;
    const pixelCount = width * height;
    const workgroups = Math.ceil(pixelCount / WORKGROUP_SIZE);

    const frameParams = new Float32Array(8);
    frameParams[3] = width;
    frameParams[4] = height;

    // Clear accum buffer
    this.device.queue.writeBuffer(this._accumBuffer, 0, new Float32Array(pixelCount * 4));

    const sb = this.sceneBuffers.buffers;

    for (let s = 0; s < samples; s++) {
      frameParams[0] = s;
      frameParams[4] = Date.now() & 0xffff;
      this.device.queue.writeBuffer(this._frameParamsBuffer, 0, frameParams);

      const encoder = this.device.createCommandEncoder();

      // Pass 1: Raygen
      const raygenGroup = this.bindGroupMgr.createRaygenGroup({
        camera: sb.camera,
        ...this._rayBuffers,
      });
      const rp1 = encoder.beginComputePass();
      rp1.setPipeline(this._pipelines.raygen);
      rp1.setBindGroup(0, raygenGroup);
      rp1.dispatchWorkgroups(workgroups);
      rp1.end();

      // Pass 2: BVH traversal
      const bvhGroup = this.bindGroupMgr.createBVHGroup({
        ...sb,
        ...this._rayBuffers,
      });
      const rp2 = encoder.beginComputePass();
      rp2.setPipeline(this._pipelines.bvh);
      rp2.setBindGroup(0, bvhGroup);
      rp2.dispatchWorkgroups(workgroups);
      rp2.end();

      // Pass 3: Shade
      const shadeGroup = this.bindGroupMgr.createShadeGroup({
        frameParams: this._frameParamsBuffer,
        ...sb,
        ...this._rayBuffers,
      });
      const rp3 = encoder.beginComputePass();
      rp3.setPipeline(this._pipelines.shade);
      rp3.setBindGroup(0, shadeGroup);
      rp3.dispatchWorkgroups(workgroups);
      rp3.end();

      // Multi-bounce loop (CPU-driven)
      for (let depth = 1; depth < maxDepth; depth++) {
        // Copy scatter → rayOrigins, normalize scatter → rayDirs
        this._copyScatterToRays(encoder);

        // BVH traversal with new rays
        const bvhGroup2 = this.bindGroupMgr.createBVHGroup({
          ...sb,
          ...this._rayBuffers,
        });
        const rpBvh = encoder.beginComputePass();
        rpBvh.setPipeline(this._pipelines.bvh);
        rpBvh.setBindGroup(0, bvhGroup2);
        rpBvh.dispatchWorkgroups(workgroups);
        rpBvh.end();

        // Shade
        const shadeGroup2 = this.bindGroupMgr.createShadeGroup({
          frameParams: this._frameParamsBuffer,
          ...sb,
          ...this._rayBuffers,
        });
        const rpShade = encoder.beginComputePass();
        rpShade.setPipeline(this._pipelines.shade);
        rpShade.setBindGroup(0, shadeGroup2);
        rpShade.dispatchWorkgroups(workgroups);
        rpShade.end();
      }

      // Pass 4: Accumulate into accumBuffer
      frameParams[0] = s + 1;
      this.device.queue.writeBuffer(this._frameParamsBuffer, 0, frameParams);

      const accumGroup = this.bindGroupMgr.createAccumGroup({
        accumBuffer: this._accumBuffer,
        outputBuffer: this._outputBuffer,
        frameParams: this._frameParamsBuffer,
      });
      const rp4 = encoder.beginComputePass();
      rp4.setPipeline(this._pipelines.accum);
      rp4.setBindGroup(0, accumGroup);
      rp4.dispatchWorkgroups(workgroups);
      rp4.end();

      this.device.queue.submit([encoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();
    }

    return this._readback(width, height);
  }

  _copyScatterToRays(encoder) {
    const rb = this._rayBuffers;
    const vec4Size = this._pixelCount() * 16;
    // Copy scatterDirs → rayDirs (normalize on GPU would need extra pass; approximate)
    encoder.copyBufferToBuffer(rb.scatterDirs, 0, rb.rayDirs, 0, vec4Size);
    // Copy rayOriginsOut → rayOrigins
    encoder.copyBufferToBuffer(rb.rayOriginsOut, 0, rb.rayOrigins, 0, vec4Size);
  }

  async _readback(width, height) {
    const n = width * height;
    const size = n * 16;
    const data = await this._staging.readback(this._outputBuffer, size);

    const pixels = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      pixels[o]     = Math.min(255, Math.max(0, data[o]     * 255));
      pixels[o + 1] = Math.min(255, Math.max(0, data[o + 1] * 255));
      pixels[o + 2] = Math.min(255, Math.max(0, data[o + 2] * 255));
      pixels[o + 3] = 255;
    }

    return { pixels, width, height };
  }

  destroy() {
    if (this._staging) this._staging.destroy();
    if (this.bufferPool) this.bufferPool.destroy();
    for (const buf of Object.values(this._rayBuffers ?? {})) {
      buf?.destroy?.();
    }
    this._accumBuffer?.destroy?.();
    this._outputBuffer?.destroy?.();
    this._frameParamsBuffer?.destroy?.();
    this.device?.destroy?.();
  }
}
