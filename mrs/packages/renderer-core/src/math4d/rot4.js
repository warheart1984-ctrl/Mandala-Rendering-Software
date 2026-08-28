/**
 * Rot4 — SO(4) plane rotations (spec surface).
 * Status: **enforced** — wraps SoT `../math/so4.js` + `../math/mat4.js`.
 *
 * Six elementary planes: XY, XZ, XW, YZ, YW, ZW.
 * Compose R = R_XY(θ1) … R_ZW(θ6) (left-to-right matrix product as in buildSO4).
 */

import {
  buildSO4,
  rotationMatrix,
  mat4mul,
  mat4apply,
  IDENTITY4,
  validateSO4,
} from "../math/so4.js";
import { composeRotations } from "../math/mat4.js";

export const ROT4_PLANES = Object.freeze(["xy", "xz", "xw", "yz", "yw", "zw"]);

/**
 * @typedef {{ xy?: number, xz?: number, xw?: number, yz?: number, yw?: number, zw?: number }} PlaneAngles
 */

/**
 * Build SO(4) from up to six plane angles (radians). Missing planes → 0.
 * @param {PlaneAngles} angles
 * @returns {Float64Array} 4×4 row-major
 */
export function rot4FromAngles(angles = {}) {
  const rotations = ROT4_PLANES.filter((p) => (angles[p] ?? 0) !== 0).map((plane) => ({
    plane,
    angle: angles[plane],
  }));
  if (rotations.length === 0) return new Float64Array(IDENTITY4);
  return buildSO4(rotations);
}

/**
 * Compose an ordered list of plane rotations.
 * @param {Array<{plane: string, angle: number}>} rotations
 * @returns {Float64Array}
 */
export function rot4Compose(rotations) {
  return buildSO4(rotations);
}

/**
 * Single plane rotation matrix.
 * @param {"xy"|"xz"|"xw"|"yz"|"yw"|"zw"} plane
 * @param {number} angle
 */
export function rot4Plane(plane, angle) {
  return rotationMatrix(plane, angle);
}

/**
 * Apply SO(4) matrix to a Vec4.
 */
export function rot4Apply(R, p) {
  return mat4apply(R, p);
}

/**
 * Multiply two SO(4) matrices: A × B.
 */
export function rot4Mul(A, B) {
  return mat4mul(A, B);
}

/**
 * Functional (point→point) composition — legacy mat4.js path.
 * Prefer rot4FromAngles / rot4Compose for matrix SoT.
 */
export function rot4ComposeFn(rotations) {
  return composeRotations(rotations);
}

export { validateSO4, IDENTITY4 as ROT4_IDENTITY };
