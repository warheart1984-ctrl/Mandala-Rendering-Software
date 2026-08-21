/**
 * EntanglementRenderer — EFR architecture facade over efr.mjs.
 * Status: **partial** (CPU PNG working; GLSL templates in shaders/)
 */

import {
  EFR_STATUS,
  EFR_MODES,
  renderEFR,
  renderBoundary,
  renderEGTHeatmap,
  renderEGTCausal,
  renderEGTEmergentGeometry,
  renderEGTCombined,
} from "./efr.mjs";

export { EFR_STATUS, EFR_MODES };

export class EntanglementRenderer {
  constructor(opts = {}) {
    this.status = EFR_STATUS;
    this.defaultWidth = opts.width ?? 384;
    this.defaultHeight = opts.height ?? 192;
  }

  /**
   * renderBoundary(egt, boundary, mode) → PNG buffer fields {width,height,rgb}
   */
  renderBoundary(egt, boundary, mode = EFR_MODES.HEATMAP) {
    return renderBoundary(egt, boundary, mode, {
      width: this.defaultWidth,
      height: this.defaultHeight,
    });
  }

  render(egt, mode = EFR_MODES.HEATMAP) {
    return renderEFR(egt, mode, {
      width: this.defaultWidth,
      height: this.defaultHeight,
    });
  }
}

export function createEntanglementRenderer(opts) {
  return new EntanglementRenderer(opts);
}

export {
  renderEFR,
  renderBoundary,
  renderEGTHeatmap,
  renderEGTCausal,
  renderEGTEmergentGeometry,
  renderEGTCombined,
};
