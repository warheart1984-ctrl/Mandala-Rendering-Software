/**
 * DifferentiationEngine — computes the differentiation state of a node from
 * its parent state + deterministic seed.
 *
 * The transition is χₙ → D(χₙ) → χₙ₊₁ where D is the endogenous
 * differentiation operator. Magnitude is carried through scale (power-law
 * distributed); direction is carried through 4D rotations in the xy and zw
 * planes of the substrate.
 *
 * Status: enforced (verified by differentiation tests).
 */

import { vec4 } from "../../render/rt4d/math/vec4.js";
import { createDifferentiationState } from "./DifferentiationState.js";

export function rotateInPlane(v, i, j, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = v[i];
  const b = v[j];
  const out = { ...v };
  out[i] = a * c - b * s;
  out[j] = a * s + b * c;
  return vec4(out.x, out.y, out.z, out.w);
}

/**
 * Deterministic differentiation of a parent state into a child state.
 *
 * @param {{x:number,y:number,z:number,w:number}} parentState
 * @param {number} scale child scale factor (0 < scale < 1)
 * @param {number} theta1 rotation angle in the xy plane
 * @param {number} theta2 rotation angle in the zw plane
 */
export function differentiateState(parentState, scale, theta1, theta2) {
  let s = rotateInPlane(parentState, "x", "y", theta1);
  s = rotateInPlane(s, "z", "w", theta2);
  return {
    x: s.x * scale,
    y: s.y * scale,
    z: s.z * scale,
    w: s.w * scale,
  };
}

export function computeDifferentiationState(parentNode, scale, theta1, theta2, level) {
  const state = differentiateState(parentNode.state.state, scale, theta1, theta2);
  const potential = Math.sqrt(
    state.x * state.x + state.y * state.y + state.z * state.z + state.w * state.w,
  );
  return createDifferentiationState({
    state,
    potential,
    level,
    scale,
    parameters: { theta1, theta2 },
  });
}