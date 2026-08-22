/**
 * HolographicEncoder — build / update EGT from bulk + boundary projection.
 * Status: **partial** — synthetic dual, not AdS/CFT engine.
 */

import { buildEGT, updateEGT, evolveEGTSequence, EGT_STATUS } from "./egt.mjs";
import { BoundaryProjection } from "./boundary-projection.mjs";

export const HOLOGRAPHIC_ENCODER_STATUS = "partial";

export class HolographicEncoder {
  constructor(opts = {}) {
    this.status = HOLOGRAPHIC_ENCODER_STATUS;
    this.boundary = opts.boundaryProjection || new BoundaryProjection(opts);
    this.stride = opts.stride ?? 2;
    this.alpha = opts.alpha;
    this.beta = opts.beta;
  }

  /**
   * buildEGT(bulk, boundary?) — boundary optional; rebuilt via P if omitted.
   */
  buildEGT(bulk, boundary) {
    void boundary;
    return buildEGT(bulk, {
      stride: this.stride,
      alpha: this.alpha,
      beta: this.beta,
      t: bulk.t,
    });
  }

  updateEGT(egt, bulk) {
    return updateEGT(egt, bulk, {
      stride: this.stride,
      alpha: this.alpha,
      beta: this.beta,
    });
  }

  evolveSequence(bulk, frames) {
    return evolveEGTSequence(bulk, frames, {
      stride: this.stride,
      alpha: this.alpha,
      beta: this.beta,
    });
  }
}

export function createHolographicEncoder(opts) {
  return new HolographicEncoder(opts);
}

void EGT_STATUS;
