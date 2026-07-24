/**
 * Optional CSSV-shaped evidence (record-optional — does not fail frames).
 */
export class WavefrontEvidence {
  constructor(options = {}) {
    /** @type {object[]} */
    this.records = [];
    this._writer = typeof options.write === "function" ? options.write : null;
    /** @type {object|null} */
    this._current = null;
  }

  /** @param {import("./WavefrontConfig.js").WavefrontConfig} config */
  beginFrame(config) {
    this._current = {
      frameId: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quality: config.quality,
      kernels: {},
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * @param {"generate"|"extend"|"shade"|"accumulate"|"denoise"} stage
   * @param {import("./WavefrontPipeline.js").WavefrontKernelContext} ctx
   */
  markKernel(stage, ctx) {
    if (!this._current) return ctx;
    const now = new Date().toISOString();
    if (!this._current.kernels[stage]) {
      this._current.kernels[stage] = { startedAt: now, finishedAt: null };
    } else {
      this._current.kernels[stage].finishedAt = now;
    }
    return ctx;
  }

  async endFrame() {
    if (!this._current) return;
    this._current.finishedAt = new Date().toISOString();
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
