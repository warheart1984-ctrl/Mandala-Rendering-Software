/**
 * Runs generate → extend → shade → accumulate (+ optional denoise stub).
 * Real kernels use `_runFrameBatched` (one encoder, multi-bounce).
 * Stub kernels use `_runFrameLegacy` (RHI dispatch per stage).
 */
export class DefaultWavefrontScheduler {
  /**
   * @param {object} deps
   * @param {import("./WavefrontKernels.js").StubWavefrontKernels | import("./WavefrontKernels.js").RealWavefrontKernels} deps.kernels
   * @param {import("./WavefrontEvidence.js").WavefrontEvidence} deps.evidence
   * @param {import("./WavefrontDenoiser.js").WavefrontDenoiser} [deps.denoiser]
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
    if (this.kernels?.isBatched === true) {
      return this._runFrameBatched(config);
    }
    return this._runFrameLegacy(config);
  }

  /**
   * Stub / RHI path: one launch per stage (Phase B conformance).
   * @param {import("./WavefrontConfig.js").WavefrontConfig} config
   */
  async _runFrameLegacy(config) {
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

  /**
   * Real WebGPU path: generate → (extend → shade → copy) × maxDepth → accumulate
   * in ONE command encoder per sample.
   * @param {import("./WavefrontConfig.js").WavefrontConfig} config
   */
  async _runFrameBatched(config) {
    this.evidence.beginFrame(config);
    const ctx = this.makeContext();
    const device = ctx.gpuDevice ?? this.kernels.device;
    if (!device?.createCommandEncoder) {
      throw new Error("Real wavefront batched path requires a GPUDevice");
    }

    const maxDepth = Math.max(1, config.maxDepth ?? 4);
    const samples = Math.max(1, config.samplesPerPixel ?? 1);
    const seed = config.seed ?? 0x4d5253;

    for (let s = 0; s < samples; s++) {
      if (typeof this.kernels.writeFrameParams === "function") {
        // ACCUM expects sampleIndex as averaging divisor (1-based for first sample).
        this.kernels.writeFrameParams(s + 1, { maxDepth, seed: seed + s });
      }

      const encoder = device.createCommandEncoder();

      this.evidence.markKernel("generate", ctx);
      this.kernels.launchGenerate(encoder);
      this.evidence.markKernel("generate", ctx);

      for (let depth = 0; depth < maxDepth; depth++) {
        this.evidence.markKernel("extend", ctx);
        this.kernels.launchExtend(encoder);
        this.evidence.markKernel("extend", ctx);

        this.evidence.markKernel("shade", ctx);
        this.kernels.launchShade(encoder);
        this.evidence.markKernel("shade", ctx);

        this.kernels.copyScatterToRays(encoder);
      }

      this.evidence.markKernel("accumulate", ctx);
      this.kernels.launchAccumulate(encoder);
      this.evidence.markKernel("accumulate", ctx);

      device.queue.submit([encoder.finish()]);
      if (typeof device.queue.onSubmittedWorkDone === "function") {
        await device.queue.onSubmittedWorkDone();
      }
    }

    if (config.enableDenoiser && this.denoiser) {
      this.evidence.markKernel("denoise", ctx);
      await this.denoiser.run(ctx, { strength: 0.5, temporalRadius: 1 });
      this.evidence.markKernel("denoise", ctx);
    }

    await this.evidence.endFrame();
  }
}
