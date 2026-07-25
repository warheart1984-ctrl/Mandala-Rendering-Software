/**
 * Denoiser — Phase B records intent only; not a production filter.
 * No-op: does not dispatch a stub kernel (avoids broken denoise dispatch).
 */
export class WavefrontDenoiser {
  /**
   * @param {import("./WavefrontPipeline.js").WavefrontKernelContext} _ctx
   * @param {{ strength?: number, temporalRadius?: number }} [config]
   */
  async run(_ctx, config = {}) {
    return { applied: false, stub: true, ...config };
  }
}

/** @deprecated Use WavefrontDenoiser — kept for Phase B import compatibility */
export { WavefrontDenoiser as WavefrontDenoiserStub };
