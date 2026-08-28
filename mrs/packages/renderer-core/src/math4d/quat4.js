/**
 * Quat4 / Bivec — SO(4) via left+right unit quaternions (isoclinic).
 * Status: **partial** — apply/toMat + quat exp/log/SLERP + bivec packing exp/log;
 * full Cartan / arbitrary-matrix factorization remains **declared**.
 *
 * Identify ℝ⁴ with quaternions. Double-cover map:
 *   (qL, qR) · v  ↦  qL * v * conjugate(qR)
 * yields an element of SO(4).
 */

import { IDENTITY4, validateSO4 } from "../math/so4.js";

/** @typedef {{ w: number, x: number, y: number, z: number }} Quat */

export function quat(w = 1, x = 0, y = 0, z = 0) {
  return { w, x, y, z };
}

export function quatIdentity() {
  return quat(1, 0, 0, 0);
}

export function quatConjugate(q) {
  return quat(q.w, -q.x, -q.y, -q.z);
}

export function quatMul(a, b) {
  return quat(
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  );
}

export function quatNorm(q) {
  return Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
}

export function quatNormalize(q) {
  const n = quatNorm(q);
  if (n < 1e-12) return quatIdentity();
  return quat(q.w / n, q.x / n, q.y / n, q.z / n);
}

export function quatDot(a, b) {
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

export function quatNeg(q) {
  return quat(-q.w, -q.x, -q.y, -q.z);
}

/**
 * Exponential map: pure quaternion (w≈0) → unit quaternion.
 * exp(θ û) = cos(θ) + û sin(θ). Status: **enforced** (quat algebra).
 * @param {Quat} pure
 */
export function quatExp(pure) {
  const theta = Math.hypot(pure.x, pure.y, pure.z);
  if (theta < 1e-12) {
    return quatNormalize(quat(1, pure.x, pure.y, pure.z));
  }
  const s = Math.sin(theta) / theta;
  return quat(Math.cos(theta), pure.x * s, pure.y * s, pure.z * s);
}

/**
 * Principal logarithm of a unit quaternion → pure quaternion.
 * Chooses the double-cover representative with w ≥ 0. Status: **enforced**.
 * @param {Quat} q
 */
export function quatLog(q) {
  let qn = quatNormalize(q);
  if (qn.w < 0) qn = quatNeg(qn);
  const vnorm = Math.hypot(qn.x, qn.y, qn.z);
  if (vnorm < 1e-12) return quat(0, 0, 0, 0);
  const w = Math.min(1, Math.max(-1, qn.w));
  const theta = Math.acos(w);
  const s = theta / vnorm;
  return quat(0, qn.x * s, qn.y * s, qn.z * s);
}

/**
 * Double-cover-aware quaternion SLERP. Status: **enforced** (quat algebra).
 * @param {Quat} a
 * @param {Quat} b
 * @param {number} t
 */
export function quatSlerp(a, b, t) {
  const qa = quatNormalize(a);
  let qb = quatNormalize(b);
  let cosTheta = quatDot(qa, qb);
  if (cosTheta < 0) {
    qb = quatNeg(qb);
    cosTheta = -cosTheta;
  }
  if (cosTheta > 0.9995) {
    return quatNormalize(
      quat(
        qa.w + (qb.w - qa.w) * t,
        qa.x + (qb.x - qa.x) * t,
        qa.y + (qb.y - qa.y) * t,
        qa.z + (qb.z - qa.z) * t
      )
    );
  }
  const theta = Math.acos(Math.min(1, cosTheta));
  const sinTheta = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / sinTheta;
  const w1 = Math.sin(t * theta) / sinTheta;
  return quat(
    qa.w * w0 + qb.w * w1,
    qa.x * w0 + qb.x * w1,
    qa.y * w0 + qb.y * w1,
    qa.z * w0 + qb.z * w1
  );
}

/**
 * Apply left/right unit quaternions to a Vec4 (as quaternion with scalar part = w coord).
 * Convention: Vec4 (x,y,z,w) ↔ quat(w, x, y, z).
 */
export function quat4Apply(qL, qR, p) {
  const v = quat(p.w, p.x, p.y, p.z);
  const out = quatMul(quatMul(qL, v), quatConjugate(qR));
  return { x: out.x, y: out.y, z: out.z, w: out.w };
}

/**
 * Build SO(4) matrix by applying (qL, qR) to the standard basis.
 * @returns {Float64Array} row-major 4×4
 */
export function quat4ToMat4(qL, qR) {
  const L = quatNormalize(qL);
  const R = quatNormalize(qR);
  const e = [
    { x: 1, y: 0, z: 0, w: 0 },
    { x: 0, y: 1, z: 0, w: 0 },
    { x: 0, y: 0, z: 1, w: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
  ];
  const cols = e.map((p) => quat4Apply(L, R, p));
  const m = new Float64Array(16);
  for (let j = 0; j < 4; j++) {
    m[0 + j] = cols[j].x;
    m[4 + j] = cols[j].y;
    m[8 + j] = cols[j].z;
    m[12 + j] = cols[j].w;
  }
  return m;
}

/**
 * Double-cover SLERP of an SO(4) pair (qL, qR). Status: **partial** (pair geodesic).
 * @returns {{ qL: Quat, qR: Quat }}
 */
export function quat4Slerp(qL0, qR0, qL1, qR1, t) {
  return {
    qL: quatSlerp(qL0, qL1, t),
    qR: quatSlerp(qR0, qR1, t),
  };
}

/**
 * Quat4 SLERP → SO(4) matrix.
 * @returns {Float64Array}
 */
export function quat4SlerpMat(qL0, qR0, qL1, qR1, t) {
  const { qL, qR } = quat4Slerp(qL0, qR0, qL1, qR1, t);
  return quat4ToMat4(qL, qR);
}

/**
 * Bivec as six plane-angle components (Lie algebra so(4) ≅ ℝ⁶).
 * @typedef {{ xy: number, xz: number, xw: number, yz: number, yw: number, zw: number }} Bivec6
 */
export function bivec6(angles = {}) {
  return {
    xy: angles.xy ?? 0,
    xz: angles.xz ?? 0,
    xw: angles.xw ?? 0,
    yz: angles.yz ?? 0,
    yw: angles.yw ?? 0,
    zw: angles.zw ?? 0,
  };
}

/**
 * Packing convention (**partial**, documented — not unique Cartan factorization):
 *   left  pure ← (yz, xz, xy) / 2
 *   right pure ← (xw, yw, zw) / 2
 *
 * @param {Partial<Bivec6>} b
 * @returns {{ qL: Quat, qR: Quat }}
 */
export function bivecExp(b) {
  const B = bivec6(b);
  const qL = quatExp(quat(0, B.yz / 2, B.xz / 2, B.xy / 2));
  const qR = quatExp(quat(0, B.xw / 2, B.yw / 2, B.zw / 2));
  return { qL, qR };
}

/**
 * Inverse of {@link bivecExp} packing. Status: **partial**.
 * @param {Quat} qL
 * @param {Quat} qR
 * @returns {Bivec6}
 */
export function bivecLog(qL, qR) {
  const L = quatLog(qL);
  const R = quatLog(qR);
  return bivec6({
    xy: 2 * L.z,
    xz: 2 * L.y,
    yz: 2 * L.x,
    xw: 2 * R.x,
    yw: 2 * R.y,
    zw: 2 * R.z,
  });
}

/**
 * Bivec packing → SO(4) matrix via Quat4.
 * @param {Partial<Bivec6>} b
 */
export function bivecExpMat(b) {
  const { qL, qR } = bivecExp(b);
  return quat4ToMat4(qL, qR);
}

/**
 * Status note for consumers.
 */
export const QUAT4_STATUS = Object.freeze({
  quat4Apply: "partial",
  quat4ToMat4: "partial",
  quatExpLog: "enforced",
  quatSlerp: "enforced",
  quat4Slerp: "partial",
  bivecExpLog: "partial",
  mat4Factorization: "declared",
  validate: validateSO4,
  identity: IDENTITY4,
});
