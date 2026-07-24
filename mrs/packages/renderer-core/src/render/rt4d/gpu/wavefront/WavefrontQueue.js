/**
 * @typedef {object} PathState
 * @property {number} id
 * @property {number} pixelX
 * @property {number} pixelY
 * @property {number} dimension4
 * @property {number} depth
 * @property {[number, number, number, number]} throughput
 * @property {boolean} terminated
 */

/**
 * In-memory stage queues (Phase B — host staging only).
 */
export class GpuWavefrontQueue {
  constructor() {
    /** @type {PathState[]} */
    this.generate = [];
    /** @type {PathState[]} */
    this.extend = [];
    /** @type {PathState[]} */
    this.shade = [];
    /** @type {PathState[]} */
    this.accumulate = [];
  }

  /** @param {PathState[]} batch */
  enqueueGenerate(batch) {
    this.generate.push(...batch);
  }

  /** @param {PathState[]} batch */
  enqueueExtend(batch) {
    this.extend.push(...batch);
  }

  /** @param {PathState[]} batch */
  enqueueShade(batch) {
    this.shade.push(...batch);
  }

  /** @param {PathState[]} batch */
  enqueueAccumulate(batch) {
    this.accumulate.push(...batch);
  }

  async flush() {
    /* kernels drain via scheduler; flush is a sync point */
  }

  clear() {
    this.generate.length = 0;
    this.extend.length = 0;
    this.shade.length = 0;
    this.accumulate.length = 0;
  }
}
