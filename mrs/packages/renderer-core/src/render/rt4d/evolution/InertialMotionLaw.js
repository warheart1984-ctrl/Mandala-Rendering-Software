import { sha256Canonical } from "./hash.js";

/**
 * Toy inertial-motion evolution law (Phase-2A).
 *
 *   position(t+Δt) = position(t) + velocity * Δt
 *   velocity(t+Δt) = velocity(t)
 *
 * Classification: toy_model — not a physical dynamics claim.
 */

export const INERTIAL_MOTION_LAW_ID = "inertial-motion-v1";
export const DEFAULT_FIXED_DELTA = 1 / 60;

/**
 * @typedef {object} Vec3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * @typedef {object} InertialState
 * @property {number} t
 * @property {Vec3} position
 * @property {Vec3} velocity
 */

/**
 * Canonical law specification (hashable; no wall-clock fields).
 * @param {{fixedDelta?: number}} [opts]
 */
export function createInertialMotionLawSpec(opts = {}) {
  const fixedDelta = opts.fixedDelta ?? DEFAULT_FIXED_DELTA;
  if (!Number.isFinite(fixedDelta) || fixedDelta <= 0) {
    throw new Error("inertial-motion-v1: fixedDelta must be a finite positive number");
  }
  return Object.freeze({
    lawId: INERTIAL_MOTION_LAW_ID,
    classification: /** @type {const} */ ("toy_model"),
    fixedDelta,
    dimensions: 3,
    stepRule: "position += velocity * fixedDelta; velocity unchanged; t += fixedDelta",
  });
}

/**
 * @param {ReturnType<typeof createInertialMotionLawSpec>} spec
 */
export function computeLawHash(spec) {
  return sha256Canonical({
    lawId: spec.lawId,
    classification: spec.classification,
    fixedDelta: spec.fixedDelta,
    dimensions: spec.dimensions,
    stepRule: spec.stepRule,
  });
}

/**
 * @param {ReturnType<typeof createInertialMotionLawSpec>} spec
 */
export function bindInertialMotionLaw(spec) {
  const lawHash = computeLawHash(spec);
  return Object.freeze({
    ...spec,
    lawHash,
    status: /** @type {const} */ ("toy_model"),
  });
}

/**
 * @param {unknown} n
 */
export function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * @param {unknown} v
 * @returns {v is Vec3}
 */
export function isFiniteVec3(v) {
  return (
    !!v &&
    typeof v === "object" &&
    isFiniteNumber(/** @type {Vec3} */ (v).x) &&
    isFiniteNumber(/** @type {Vec3} */ (v).y) &&
    isFiniteNumber(/** @type {Vec3} */ (v).z)
  );
}

/**
 * @param {unknown} state
 * @returns {{ok: true, state: InertialState} | {ok: false, error: string}}
 */
export function validateInertialState(state) {
  if (!state || typeof state !== "object") {
    return { ok: false, error: "state must be an object" };
  }
  const s = /** @type {InertialState} */ (state);
  if (!isFiniteNumber(s.t)) return { ok: false, error: "state.t must be finite" };
  if (!isFiniteVec3(s.position)) return { ok: false, error: "state.position must be finite vec3" };
  if (!isFiniteVec3(s.velocity)) return { ok: false, error: "state.velocity must be finite vec3" };
  return {
    ok: true,
    state: {
      t: s.t,
      position: { x: s.position.x, y: s.position.y, z: s.position.z },
      velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
    },
  };
}

/**
 * @param {InertialState} state
 */
export function hashInertialState(state) {
  const v = validateInertialState(state);
  if (!v.ok) throw new Error(v.error);
  return sha256Canonical({
    kind: "inertialState.v1",
    t: v.state.t,
    position: v.state.position,
    velocity: v.state.velocity,
  });
}

/**
 * One fixed step under inertial-motion-v1.
 * @param {InertialState} state
 * @param {number} fixedDelta
 * @returns {InertialState}
 */
export function stepInertial(state, fixedDelta) {
  const v = validateInertialState(state);
  if (!v.ok) throw new Error(v.error);
  if (!Number.isFinite(fixedDelta) || fixedDelta <= 0) {
    throw new Error("fixedDelta must be finite and positive");
  }
  const { position: p, velocity: vel, t } = v.state;
  return {
    t: t + fixedDelta,
    position: {
      x: p.x + vel.x * fixedDelta,
      y: p.y + vel.y * fixedDelta,
      z: p.z + vel.z * fixedDelta,
    },
    velocity: { x: vel.x, y: vel.y, z: vel.z },
  };
}
