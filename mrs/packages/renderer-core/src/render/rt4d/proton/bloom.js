/**
 * Proton HQ bloom (optional post).
 *
 * STATUS: **declared** — stub only; not wired. Implementor may fill later.
 * Default preset bloom=false. No GPU claim.
 *
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 */

/**
 * @typedef {object} BloomOpts
 * @property {number} [threshold]
 * @property {number} [strength]
 * @property {number} [radius]
 */

/**
 * Apply bloom to float RGBA.
 *
 * STATUS: **declared** — no-op operator not shipped; CLI refuses `--bloom`.
 *
 * @param {Float32Array|number[]} floatRgba
 * @param {BloomOpts} [opts]
 * @returns {Float32Array|number[]}
 */
export function applyBloom(floatRgba, opts = {}) {
  void floatRgba;
  void opts;
  throw new Error(
    "applyBloom: declared — bloom not shipped this trail (refuse --bloom)",
  );
}
