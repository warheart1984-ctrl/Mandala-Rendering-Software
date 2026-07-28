/**
 * CECP Mod 4 — ProtonRaster→DepthField
 *
 * STATUS: **enforced**
 *
 * Weighted average depth from splat accumulation.
 * Guarantees: all values ≥ 0; no NaN; background = 0 when weight=0.
 */

/**
 * @typedef {object} DepthField
 * @property {number} width
 * @property {number} height
 * @property {Float32Array} depth
 * @property {number} min
 * @property {number} max
 * @property {string} status
 */

/**
 * @param {import("./rasterizeProtons.js").ProtonRaster} raster
 * @returns {DepthField}
 */
export function depthFromRaster(raster) {
  if (!raster || !(raster.depthSum instanceof Float32Array)) {
    throw new Error("depthFromRaster: ProtonRaster with depthSum required");
  }
  const { width, height, depthSum, depthWeight } = raster;
  const n = width * height;
  const depth = new Float32Array(n);
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const w = depthWeight[i] || 0;
    let d = w > 1e-12 ? depthSum[i] / w : 0;
    if (!Number.isFinite(d) || d < 0) d = 0;
    depth[i] = d;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  if (!Number.isFinite(min)) min = 0;
  return {
    width,
    height,
    depth,
    min,
    max,
    status: "enforced",
  };
}

/**
 * @param {DepthField} field
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function assertDepthFieldInvariants(field) {
  /** @type {string[]} */
  const errors = [];
  for (let i = 0; i < field.depth.length; i++) {
    const d = field.depth[i];
    if (!Number.isFinite(d)) errors.push(`NaN/Inf at ${i}`);
    if (d < 0) errors.push(`negative depth at ${i}`);
  }
  return { ok: errors.length === 0, errors };
}
