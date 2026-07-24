/**
 * Optional CSSV-shaped evidence (record-optional — does not fail frames).
 * Frame ids are deterministic counters (P4 / replayable).
 */
export class WavefrontEvidence {
  constructor(options = {}) {
    /** @type {object[]} */
    this.records = [];
    this._writer = typeof options.write === "function" ? options.write : null;
    /** @type {object|null} */
    this._current = null;
    this._frameCounter = 0;
    this._seed = options.seed ?? 0;
  }

  /** @param {import("./WavefrontConfig.js").WavefrontConfig} config */
  beginFrame(config) {
    this._frameCounter += 1;
    this._current = {
      schema: "cssv-wavefront",
      frameId: `wf-${this._seed}-${this._frameCounter}`,
      quality: config.quality,
      backend: "webgpu",
      kernels: {},
      startedAtSeq: this._frameCounter,
    };
  }

  /**
   * @param {"generate"|"extend"|"shade"|"accumulate"|"denoise"} stage
   * @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx
   */
  markKernel(stage, ctx) {
    if (!this._current) return ctx;
    if (!this._current.kernels[stage]) {
      this._current.kernels[stage] = { startedSeq: this._frameCounter, finishedSeq: null };
    } else {
      this._current.kernels[stage].finishedSeq = this._frameCounter;
    }
    return ctx;
  }

  async endFrame() {
    if (!this._current) return;
    this._current.finishedSeq = this._frameCounter;
    this.records.push(this._current);
    if (this._writer) {
      try {
        await this._writer(this._current);
      } catch {
        /* record-optional: swallow writer errors */
      }
    }
    this._current = null;
  }
}
