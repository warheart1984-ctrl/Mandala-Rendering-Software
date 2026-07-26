import { vec3 } from "../math3d/vec3.js";
import { vec4 } from "../math/vec4.js";

/**
 * Dimensional-shift helpers for BridgeContract v2.0.
 *
 * Status: **declared** / pure-function **skeleton** for portal-like thresholds.
 * `shouldDimensionalShift` documents Θ > τ only — there is no live portal
 * system, renderer hook, or CKL gate. Not wired into PathTracer4D / Genblaze.
 */

/**
 * Transition intensity sample: σ · |ψ| (deterministic, local).
 * @param {number} psi
 * @param {number} [sigma=1]
 * @returns {number}
 */
export function transitionSignal(psi, sigma = 1) {
  return sigma * Math.abs(psi);
}

/**
 * Declared dimensional-shift predicate: true when Θ > τ.
 * Does not emit events or mutate scene state.
 * @param {number} theta Transition intensity Θ
 * @param {number} tau Threshold τ
 * @returns {boolean}
 */
export function shouldDimensionalShift(theta, tau) {
  return theta > tau;
}

/**
 * Lift a 3D point into 4D with explicit w (identity-style map).
 * Status: declared helper — not a spacetime portal implementation.
 * @param {{ x: number, y: number, z: number }} pos3
 * @param {number} [w=0]
 * @returns {{ x: number, y: number, z: number, w: number }}
 */
export function shiftMap3to4(pos3, w = 0) {
  return vec4(pos3.x, pos3.y, pos3.z, w);
}

/**
 * Project 4D → 3D by dropping w.
 * @param {{ x: number, y: number, z: number, w?: number }} pos4
 * @returns {{ x: number, y: number, z: number }}
 */
export function returnMap4to3(pos4) {
  return vec3(pos4.x, pos4.y, pos4.z);
}
