/**
 * Physical / mathematical invariants for the RT4D math engine.
 *
 * Source: "Physical Invariant" note (filename misspelled "Pyshical Invarante.docx").
 * Encodes the document's pattern: Invariant → boolean predicate on states.
 *
 * Status (Drive-G-1):
 *   - Predicates and 2D rotation formulas: tested numerically (see physicalInvariants.test.js).
 *   - Runtime enforcement inside the path tracer / governance pipeline: declared only
 *     (not wired as a render gate here).
 *
 * Does not invent physics beyond the document. The geometry claim RᵀR = I ⇒ ‖Rv‖² = ‖v‖²
 * is dimension-agnostic; 4D helpers reuse the same predicate on vec4.
 */

import { dot, len2, vec4 } from "./vec4.js";

/** Default absolute tolerance used by document predicate forms. */
export const PHYSICAL_INVARIANT_TOL = 1e-9;

/**
 * Geometry: length (squared Euclidean norm) is preserved under rotation /
 * orthogonal transforms: ‖v‖² = ‖Rv‖².
 *
 * Document predicate:
 *   abs(v.dot(v) - v_rot.dot(v_rot)) < tol
 *
 * @param {{x:number,y:number,z?:number,w?:number}|number[]} v
 * @param {{x:number,y:number,z?:number,w?:number}|number[]} vRot
 * @param {number} [tol]
 * @returns {boolean}
 */
export function lengthPreserved(v, vRot, tol = PHYSICAL_INVARIANT_TOL) {
  return Math.abs(squaredNorm(v) - squaredNorm(vRot)) < tol;
}

/**
 * Calculus: energy conserved over time when dE/dt = 0 ⇒ E(t) = C ⇒ E(t1) = E(t2).
 *
 * Document predicate:
 *   abs(E_before - E_after) < tol
 *
 * @param {number} eBefore
 * @param {number} eAfter
 * @param {number} [tol]
 * @returns {boolean}
 */
export function energyConserved(eBefore, eAfter, tol = PHYSICAL_INVARIANT_TOL) {
  return Math.abs(eBefore - eAfter) < tol;
}

/**
 * Trig: radial distance invariant under explicit 2D rotation
 *   x' = x cos θ − y sin θ
 *   y' = x sin θ + y cos θ
 * which yields x'² + y'² = x² + y² via cos²θ + sin²θ = 1.
 *
 * Document predicate:
 *   abs((x**2 + y**2) - (x_p**2 + y_p**2)) < tol
 *
 * @param {number} x
 * @param {number} y
 * @param {number} xp
 * @param {number} yp
 * @param {number} [tol]
 * @returns {boolean}
 */
export function radialDistanceInvariant(x, y, xp, yp, tol = PHYSICAL_INVARIANT_TOL) {
  return Math.abs(x * x + y * y - (xp * xp + yp * yp)) < tol;
}

/**
 * Explicit 2D rotation from the document's trigonometric section.
 * @param {number} x
 * @param {number} y
 * @param {number} theta radians
 * @returns {{x: number, y: number}}
 */
export function rotate2d(x, y, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: x * c - y * s,
    y: x * s + y * c,
  };
}

/**
 * Trig identity used in the document's radial-distance proof: cos²θ + sin²θ = 1.
 * @param {number} theta radians
 * @param {number} [tol]
 * @returns {boolean}
 */
export function pythagoreanIdentityHolds(theta, tol = PHYSICAL_INVARIANT_TOL) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return Math.abs(c * c + s * s - 1) < tol;
}

/**
 * Apply document geometry + trig together: rotate (x,y) and check radial invariance.
 * @param {number} x
 * @param {number} y
 * @param {number} theta
 * @param {number} [tol]
 * @returns {boolean}
 */
export function lengthPreservedUnder2dRotation(x, y, theta, tol = PHYSICAL_INVARIANT_TOL) {
  const r = rotate2d(x, y, theta);
  return radialDistanceInvariant(x, y, r.x, r.y, tol);
}

/**
 * 4D convenience: length preserved between two vec4 states (same geometric invariant).
 * @param {{x:number,y:number,z:number,w:number}} v
 * @param {{x:number,y:number,z:number,w:number}} vRot
 * @param {number} [tol]
 * @returns {boolean}
 */
export function lengthPreserved4(v, vRot, tol = PHYSICAL_INVARIANT_TOL) {
  return Math.abs(len2(v) - len2(vRot)) < tol;
}

/**
 * Catalog of invariants from the source document (for docs / introspection).
 * status: "tested" means unit tests assert the predicate; not a runtime render gate.
 */
export const PHYSICAL_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "PI-GEO-LENGTH",
    branch: "geometry",
    statement: "Orthogonal transforms preserve squared length: ‖v‖² = ‖Rv‖² when RᵀR = I",
    predicate: "lengthPreserved",
    status: "tested",
  }),
  Object.freeze({
    id: "PI-CALC-ENERGY",
    branch: "calculus",
    statement: "dE/dt = 0 ⇒ E(t) constant ⇒ E(t1) = E(t2)",
    predicate: "energyConserved",
    status: "tested",
  }),
  Object.freeze({
    id: "PI-TRIG-RADIAL",
    branch: "trigonometry",
    statement: "2D rotation with cos²θ+sin²θ=1 preserves x²+y²",
    predicate: "radialDistanceInvariant",
    status: "tested",
  }),
]);

/**
 * Meta-pattern from the document: every invariant collapses to a boolean on states.
 * @param {string} id
 * @param {boolean} ok
 * @param {object} [evidence]
 * @returns {{id: string, ok: boolean, evidence: object}}
 */
export function invariantPredicateResult(id, ok, evidence = {}) {
  return { id, ok: !!ok, evidence };
}

function squaredNorm(v) {
  if (Array.isArray(v)) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return s;
  }
  if (v && typeof v === "object") {
    if ("w" in v || "z" in v) {
      return dot(
        vec4(v.x || 0, v.y || 0, v.z || 0, v.w || 0),
        vec4(v.x || 0, v.y || 0, v.z || 0, v.w || 0),
      );
    }
    return (v.x || 0) * (v.x || 0) + (v.y || 0) * (v.y || 0);
  }
  throw new TypeError("squaredNorm: expected array or {x,y[,z,w]}");
}
