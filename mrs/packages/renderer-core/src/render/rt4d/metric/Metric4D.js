/**
 * Metric4D — Layer 2 contract for the RT4D spacetime / temporal-state lab.
 *
 * Status (Drive-G-1): interface + Euclidean/Minkowski implementations are partial/tested
 * in Phase-1; curved metrics are declared only.
 *
 * The affine substrate (vec4 / Transform4D) stays metric-agnostic. Modes assign meaning
 * to the fourth coordinate; metrics define inner product, interval, and (where applicable)
 * causal classification.
 */

/** @typedef {"timelike"|"spacelike"|"lightlike"|"euclidean"} IntervalClass */

/**
 * @typedef {object} Metric4D
 * @property {string} id
 * @property {string} version  - semantic version of the metric implementation
 * @property {string} [signature]
 * @property {(a: import("../math/vec4.js").Vec4Like, b: import("../math/vec4.js").Vec4Like) => number} innerProduct
 * @property {(a: import("../math/vec4.js").Vec4Like, b: import("../math/vec4.js").Vec4Like) => number} intervalSquared - ds², not ds
 * @property {(a: import("../math/vec4.js").Vec4Like, b: import("../math/vec4.js").Vec4Like) => number} interval - alias of intervalSquared
 * @property {(a: import("../math/vec4.js").Vec4Like, b: import("../math/vec4.js").Vec4Like) => IntervalClass} classifyInterval
 */

export const METRIC_IDS = Object.freeze({
  EUCLIDEAN: "euclidean",
  MINKOWSKI_MINUS_PLUS: "minkowski:-+++",
  CUSTOM_DIAGONAL: "custom-diagonal",
  CURVED_FIELD: "curved-metric-field",
});

export const INTERVAL_TOL = 1e-12;

/**
 * @param {number} value
 * @param {number} [tol]
 * @returns {"negative"|"zero"|"positive"}
 */
export function signClass(value, tol = INTERVAL_TOL) {
  if (Math.abs(value) <= tol) return "zero";
  return value < 0 ? "negative" : "positive";
}
