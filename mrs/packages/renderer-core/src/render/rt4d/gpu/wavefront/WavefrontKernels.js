/**
 * Wavefront kernels dispatch named stages through RHI (Phase B stub).
 */
export class StubWavefrontKernels {
  /**
   * @param {import("../../../rhi/RhiContract.js").Rhi} rhi
   */
  constructor(rhi) {
    this.rhi = rhi;
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchGenerate(ctx) {
    await ctx.rhi.dispatchKernel("rt4d_wavefront_generate", 1, 1, 1, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchExtend(ctx) {
    await ctx.rhi.dispatchKernel("rt4d_wavefront_extend", 1, 1, 1, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchShade(ctx) {
    await ctx.rhi.dispatchKernel("rt4d_wavefront_shade", 1, 1, 1, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchAccumulate(ctx) {
    await ctx.rhi.dispatchKernel("rt4d_wavefront_accumulate", 1, 1, 1, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }

  /** @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx */
  async launchDenoise(ctx) {
    await ctx.rhi.dispatchKernel("rt4d_wavefront_denoise", 1, 1, 1, {
      frame: ctx.frameTexture,
      paths: ctx.pathBuffer,
      world: ctx.worldBuffer,
    });
  }
}
