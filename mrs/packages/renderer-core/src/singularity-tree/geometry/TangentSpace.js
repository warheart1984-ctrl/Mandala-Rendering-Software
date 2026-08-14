/**
 * TangentSpace — local frame of a leaf chart.
 *
 * Gram-Schmidt orthonormal basis {n, e1, e2, e3} built from the leaf's
 * normalized state direction n. e1..e3 span the tangent hyperplane.
 *
 * Status: enforced (verified by geometry tests).
 */

import { length } from "../../render/rt4d/math/vec4.js";

export function buildTangentFrame(direction) {
  const n = { ...direction };
  const nl = length(n);
  if (nl < 1e-12) {
    throw new Error("buildTangentFrame: degenerate (zero) chart direction");
  }
  for (const k of ["x", "y", "z", "w"]) n[k] /= nl;

  const candidates = [
    { x: 1, y: 0, z: 0, w: 0 },
    { x: 0, y: 1, z: 0, w: 0 },
    { x: 0, y: 0, z: 1, w: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
  ];

  const frame = [n];
  for (const c of candidates) {
    if (frame.length >= 4) break;
    let v = { ...c };
    for (const b of frame) {
      const dot =
        v.x * b.x + v.y * b.y + v.z * b.z + v.w * b.w;
      v = {
        x: v.x - dot * b.x,
        y: v.y - dot * b.y,
        z: v.z - dot * b.z,
        w: v.w - dot * b.w,
      };
    }
    const vl = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
    if (vl < 1e-12) continue;
    v = { x: v.x / vl, y: v.y / vl, z: v.z / vl, w: v.w / vl };
    frame.push(v);
  }

  if (frame.length < 4) {
    throw new Error("buildTangentFrame: could not build a full 4D frame");
  }

  return { normal: n, basis: frame };
}

/**
 * Express a vector v (in R4) in the local frame basis.
 * @param {{x,y,z,w}} v
 * @param {Array<{x,y,z,w}>} basis orthonormal frame
 * @returns {number[]} coordinates [c0, c1, c2, c3]
 */
export function expressInFrame(v, basis) {
  return basis.map((b) => v.x * b.x + v.y * b.y + v.z * b.z + v.w * b.w);
}