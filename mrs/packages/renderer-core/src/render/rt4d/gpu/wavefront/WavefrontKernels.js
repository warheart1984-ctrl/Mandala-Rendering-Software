import {
  GENERATE_WGSL,
  EXTEND_WGSL,
  SHADE_WGSL,
  ACCUMULATE_WGSL,
} from "./kernels/index.js";

/**
 * Wavefront kernels dispatch named stages through RHI (Phase B).
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
