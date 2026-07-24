/**
 * Denoiser stub — Phase B records intent only; not a production filter.
 */
export class WavefrontDenoiserStub {
  /**
   * @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx
   * @param {{ strength?: number, temporalRadius?: number }} [config]
   */
  async run(ctx, config = {}) {
    await ctx.rhi.dispatchKernel(
      "rt4d_wavefront_denoise_stub",
      1,
      1,
      1,
      { frame: ctx.frameTexture }
    );
    return { applied: true, stub: true, ...config };
  }
}
