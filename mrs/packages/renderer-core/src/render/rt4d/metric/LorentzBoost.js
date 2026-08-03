import { vec4 } from "../math/vec4.js";
import { METRIC_IDS } from "./Metric4D.js";
import { MINKOWSKI_METRIC } from "./MinkowskiMetric.js";

/**
 * Lorentz boost along a spatial axis (xt / yt / zt).
 * Uses rapidity η: cosh(η), sinh(η) — NOT cos/sin Euclidean rotation.
 *
 * Matrix acts on (x,y,z,w=t) with signature -+++ in natural units (c=1).
 * Status: **tested** (interval preservation unit tests). Boosts assume c=1.
 */

/** @typedef {"x"|"y"|"z"} BoostAxis */

/**
 * @param {number} rapidity
 * @returns {{cosh: number, sinh: number}}
 */
export function rapidityParts(rapidity) {
  return {
    cosh: Math.cosh(rapidity),
    sinh: Math.sinh(rapidity),
  };
}

/**
 * Build a Lorentz boost transform descriptor + apply function.
 * @param {BoostAxis} axis
 * @param {number} rapidity
 * @param {{metricId?: string, c?: number}} [opts]
 */
export function createLorentzBoost(axis, rapidity, opts = {}) {
  if (axis !== "x" && axis !== "y" && axis !== "z") {
    throw new Error(`Lorentz boost axis must be x|y|z, got ${axis}`);
  }
  const { cosh: ch, sinh: sh } = rapidityParts(rapidity);
  const metricId = opts.metricId ?? METRIC_IDS.MINKOWSKI_MINUS_PLUS;
  const c = opts.c ?? 1;

  return Object.freeze({
    transformType: "lorentz_boost",
    axis,
    rapidity,
    preservesMetric: metricId,
    c,
    matrixNote: "hyperbolic boost; not Transform4D.rotate",
    /**
     * @param {{x:number,y:number,z:number,w:number}} p
     */
    apply(p) {
      // Natural units c=1: w is t. (c≠1 boosts are declared beyond Phase-1.)
      if (axis === "x") {
        return vec4(ch * p.x - sh * p.w, p.y, p.z, -sh * p.x + ch * p.w);
      }
      if (axis === "y") {
        return vec4(p.x, ch * p.y - sh * p.w, p.z, -sh * p.y + ch * p.w);
      }
      return vec4(p.x, p.y, ch * p.z - sh * p.w, -sh * p.z + ch * p.w);
    },
  });
}

/**
 * Assert boost preserves Minkowski interval between two events (diagnostic).
 * @param {ReturnType<typeof createLorentzBoost>} boost
 * @param {{x:number,y:number,z:number,w:number}} a
 * @param {{x:number,y:number,z:number,w:number}} b
 * @param {import("./MinkowskiMetric.js").MinkowskiMetric} [metric]
 * @param {number} [tol]
 */
export function boostPreservesInterval(boost, a, b, metric = MINKOWSKI_METRIC, tol = 1e-9) {
  const a2 = boost.apply(a);
  const b2 = boost.apply(b);
  const before = metric.interval(a, b);
  const after = metric.interval(a2, b2);
  return Math.abs(before - after) <= tol;
}
