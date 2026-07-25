import {
  GENERATE_WGSL,
  EXTEND_WGSL,
  SHADE_WGSL,
  ACCUMULATE_WGSL,
} from "./kernels/index.js";
import { RAYGEN_WGSL, SHADE_WGSL as PROD_SHADE_WGSL, ACCUM_WGSL } from "../shaders.js";
import { BVH4D_WGSL_SOURCE } from "../../accel/gpu/index.js";
import { BindGroupManager } from "../bindGroupManager.js";

const WORKGROUP_SIZE = 64;

/**
 * Wavefront kernels dispatch named stages through RHI (Phase B stub path).
 * Registers file-backed WGSL when available so live WebGPU uses the same sources.
 */
export class StubWavefrontKernels {
  /**
   * @param {import("../../../rhi/RhiContract.js").Rhi} rhi
   * @param {{ width?: number, height?: number }} [opts]
   */
  constructor(rhi, opts = {}) {
    this.rhi = rhi;
    this.width = opts.width ?? 8;
    this.height = opts.height ?? 8;
    /** @type {false} */
    this.isBatched = false;
    this._registerWgsl();
  }

  _registerWgsl() {
    if (typeof this.rhi.registerKernel !== "function") return;
    const pairs = [
      ["rt4d_wavefront_generate", GENERATE_WGSL],
      ["rt4d_wavefront_extend", EXTEND_WGSL],
      ["rt4d_wavefront_shade", SHADE_WGSL],
      ["rt4d_wavefront_accumulate", ACCUMULATE_WGSL],
    ];
    for (const [name, code] of pairs) {
      if (code) this.rhi.registerKernel(name, code);
    }
  }

  _workgroups() {
    return {
      x: Math.max(1, Math.ceil(this.width / 8)),
      y: Math.max(1, Math.ceil(this.height / 8)),
      z: 1,
    };
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchGenerate(ctx) {
    const { x, y, z } = this._workgroups();
    await ctx.rhi.dispatchKernel("rt4d_wavefront_generate", x, y, z, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchExtend(ctx) {
    const { x, y, z } = this._workgroups();
    await ctx.rhi.dispatchKernel("rt4d_wavefront_extend", x, y, z, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchShade(ctx) {
    const { x, y, z } = this._workgroups();
    await ctx.rhi.dispatchKernel("rt4d_wavefront_shade", x, y, z, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchAccumulate(ctx) {
    const { x, y, z } = this._workgroups();
    await ctx.rhi.dispatchKernel("rt4d_wavefront_accumulate", x, y, z, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchDenoise(ctx) {
    const { x, y, z } = this._workgroups();
    await ctx.rhi.dispatchKernel("rt4d_wavefront_denoise", x, y, z, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }
}

/**
 * Real WebGPU wavefront kernels — production WGSL via compute pipelines.
 * All launch* methods append to a caller-provided GPUCommandEncoder so one
 * frame (generate → multi-bounce → accumulate) is a single command buffer.
 *
 * Status: partial (mock-tested; needs browser WebGPU validation).
 */
export class RealWavefrontKernels {
  /**
   * @param {GPUDevice} device
   * @param {object} opts
   * @param {number} [opts.width]
   * @param {number} [opts.height]
   * @param {BindGroupManager} [opts.bindGroupMgr]
   * @param {{ buffers: Record<string, GPUBuffer> }} opts.sceneBuffers
   * @param {Record<string, GPUBuffer>} opts.rayBuffers
   * @param {GPUBuffer} opts.frameParamsBuffer
   * @param {GPUBuffer} opts.accumBuffer
   * @param {GPUBuffer} opts.outputBuffer
   */
  constructor(device, opts) {
    this.device = device;
    this.width = opts.width ?? 8;
    this.height = opts.height ?? 8;
    this.bindGroupMgr = opts.bindGroupMgr ?? new BindGroupManager(device);
    this.sceneBuffers = opts.sceneBuffers;
    this.rayBuffers = opts.rayBuffers;
    this.frameParamsBuffer = opts.frameParamsBuffer;
    this.accumBuffer = opts.accumBuffer;
    this.outputBuffer = opts.outputBuffer;
    /** @type {true} */
    this.isBatched = true;
    /** @type {Array<{ kernelName: string, workgroups?: number, bytes?: number }>} */
    this.dispatchLog = [];
    /** @type {Record<string, GPUComputePipeline>} */
    this._pipelines = {};
    this._createPipelines();
  }

  _pixelCount() {
    return this.width * this.height;
  }

  _workgroups1d() {
    return Math.max(1, Math.ceil(this._pixelCount() / WORKGROUP_SIZE));
  }

  _createPipelines() {
    const device = this.device;
    const raygenModule = device.createShaderModule({ code: RAYGEN_WGSL });
    const bvhModule = device.createShaderModule({ code: BVH4D_WGSL_SOURCE });
    const shadeModule = device.createShaderModule({ code: PROD_SHADE_WGSL });
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

  /**
   * Write frame uniforms (sample index, resolution, seed).
   * @param {number} sampleIndex
   * @param {{ maxDepth?: number, seed?: number }} [opts]
   */
  writeFrameParams(sampleIndex, opts = {}) {
    const fp = new Float32Array(8);
    fp[0] = sampleIndex;
    fp[1] = opts.maxDepth ?? 4;
    fp[2] = this.width;
    fp[3] = this.height;
    fp[4] = opts.seed ?? 0;
    this.device.queue.writeBuffer(this.frameParamsBuffer, 0, fp);
  }

  /** @param {GPUCommandEncoder} encoder */
  launchGenerate(encoder) {
    const sb = this.sceneBuffers.buffers;
    const workgroups = this._workgroups1d();
    const group = this.bindGroupMgr.createRaygenGroup({
      camera: sb.camera,
      ...this.rayBuffers,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.raygen);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.dispatchLog.push({
      kernelName: "rt4d_wavefront_generate",
      workgroups,
      shader: "RAYGEN_WGSL",
    });
  }

  /** @param {GPUCommandEncoder} encoder */
  launchExtend(encoder) {
    const sb = this.sceneBuffers.buffers;
    const workgroups = this._workgroups1d();
    const group = this.bindGroupMgr.createBVHGroup({
      ...sb,
      ...this.rayBuffers,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.bvh);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.dispatchLog.push({
      kernelName: "rt4d_wavefront_extend",
      workgroups,
      shader: "BVH4D_WGSL_SOURCE",
    });
  }

  /** @param {GPUCommandEncoder} encoder */
  launchShade(encoder) {
    const sb = this.sceneBuffers.buffers;
    const workgroups = this._workgroups1d();
    const group = this.bindGroupMgr.createShadeGroup({
      frameParams: this.frameParamsBuffer,
      ...sb,
      ...this.rayBuffers,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.shade);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.dispatchLog.push({
      kernelName: "rt4d_wavefront_shade",
      workgroups,
      shader: "SHADE_WGSL",
    });
  }

  /** @param {GPUCommandEncoder} encoder */
  launchAccumulate(encoder) {
    // Wire shade radiance into accum (ACCUM_WGSL averages accum → output).
    const vec4Size = this._pixelCount() * 16;
    encoder.copyBufferToBuffer(
      this.rayBuffers.pathThroughput,
      0,
      this.accumBuffer,
      0,
      vec4Size
    );

    const workgroups = this._workgroups1d();
    const group = this.bindGroupMgr.createAccumGroup({
      accumBuffer: this.accumBuffer,
      outputBuffer: this.outputBuffer,
      frameParams: this.frameParamsBuffer,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.accum);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.dispatchLog.push({
      kernelName: "rt4d_wavefront_accumulate",
      workgroups,
      shader: "ACCUM_WGSL",
    });
  }

  /** @param {GPUCommandEncoder} encoder */
  copyScatterToRays(encoder) {
    const rb = this.rayBuffers;
    const vec4Size = this._pixelCount() * 16;
    encoder.copyBufferToBuffer(rb.scatterDirs, 0, rb.rayDirs, 0, vec4Size);
    encoder.copyBufferToBuffer(rb.rayOriginsOut, 0, rb.rayOrigins, 0, vec4Size);
    this.dispatchLog.push({
      kernelName: "rt4d_wavefront_copy_scatter",
      bytes: vec4Size * 2,
    });
  }
}
