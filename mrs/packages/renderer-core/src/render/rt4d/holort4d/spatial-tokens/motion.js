/**
 * Motion helpers for spatial tokens.
 * Status: partial — depth-delta / optional flow packing only.
 */

/**
 * Pack per-pixel optical flow into interleaved Float32 dx,dy.
 * @param {Float32Array|number[]} dx
 * @param {Float32Array|number[]} dy
 * @returns {Float32Array}
 */
export function packFlow(dx, dy) {
  const n = Math.min(dx.length, dy.length);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Number(dx[i]) || 0;
    out[i * 2 + 1] = Number(dy[i]) || 0;
  }
  return out;
}

export const MOTION_TOKEN_STATUS = Object.freeze({
  fromPrevDepth: "partial",
  fromFlow: "partial",
  note: "Motion vectors are cell-averaged depth deltas or packed flow; not a full optical-flow solver.",
});
