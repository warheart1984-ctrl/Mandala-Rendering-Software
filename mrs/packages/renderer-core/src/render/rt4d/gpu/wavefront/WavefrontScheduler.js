/**
 * Runs generate → extend → shade → accumulate (+ optional denoise stub).
 */
export class DefaultWavefrontScheduler {
  /**
   * @param {object} deps
   * @param {import("./WavefrontKernels.js").StubWavefrontKernels} deps.kernels
   * @param {import("./WavefrontEvidence.js").WavefrontEvidence} deps.evidence
   * @param {import("./WavefrontDenoiser.js").WavefrontDenoiserStub} [deps.denoiser]
   * @param {() => import("./WavefrontPipeline.js").WavefrontKernelContext} deps.makeContext
   */
  constructor({ kernels, evidence, denoiser, makeContext }) {
    this.kernels = kernels;
    this.evidence = evidence;
    this.denoiser = denoiser ?? null;
    this.makeContext = makeContext;
  }

  /** @param {import("./WavefrontConfig.js").WavefrontConfig} config */
  async runFrame(config) {
    this.evidence.beginFrame(config);
    const stages = /** @type {const} */ ([
      ["generate", (ctx) => this.kernels.launchGenerate(ctx)],
      ["extend", (ctx) => this.kernels.launchExtend(ctx)],
      ["shade", (ctx) => this.kernels.launchShade(ctx)],
      ["accumulate", (ctx) => this.kernels.launchAccumulate(ctx)],
    ]);

    for (const [name, launch] of stages) {
      const ctx = this.makeContext();
      this.evidence.markKernel(name, ctx);
      await launch(ctx);
      this.evidence.markKernel(name, ctx);
    }

    if (config.enableDenoiser && this.denoiser) {
      const ctx = this.makeContext();
      this.evidence.markKernel("denoise", ctx);
      await this.denoiser.run(ctx, { strength: 0.5, temporalRadius: 1 });
      this.evidence.markKernel("denoise", ctx);
    }

    await this.evidence.endFrame();
  }
}
