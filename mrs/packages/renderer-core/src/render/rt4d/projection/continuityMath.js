/**
 * Continuous P(θ, φ, τ, κ) math aligned with Projector4D closed forms.
 *
 * SoT: Projector4D (`rt4d/output/projector.js`) — this module composes the same
 * closed forms with observation params. Not a parallel print kernel.
 * Aperture ≠ print.
 *
 * Status: partial→enforced for unit continuity / fidelity / safe extreme paths.
 */

import { vec4 } from "../math/vec4.js";
import { Projector4D } from "../output/projector.js";
import { createProjectionState, toProjectorOptions } from "./ProjectionState.js";

/** Soft clamps for graceful degradation (observation assist only). */
export const EXTREME_PARAM_LIMITS = Object.freeze({
  theta: Math.PI,
  phi: Math.PI * 2,
  tau: 1e3,
  kappa: 1e3,
});

/**
 * Effective w after τ offset (observation slice).
 * @param {number} w
 * @param {number} tau
 */
export function effectiveW(w, tau) {
  return w - tau;
}

/**
 * Classic 4D→3D scale factor with τ-adjusted w.
 * Matches Projector4D when tau=0: d4/(d4+w).
 * @param {number} d4
 * @param {number} w
 * @param {number} [tau]
 */
export function wProjFactor(d4, w, tau = 0) {
  return d4 / (d4 + effectiveW(w, tau));
}

/**
 * Apply SO(2)×elevation view rotation after 4D→3D (θ polar, φ azimuth).
 * Identity when θ=0, φ=0: returns (x,y,z) unchanged.
 * @param {{x:number,y:number,z:number}} p3
 * @param {number} theta
 * @param {number} phi
 */
export function applyViewOrientation(p3, theta, phi) {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  // Rotate: first around Z by φ, then tilt by θ in the XZ plane.
  const x1 = p3.x * cp - p3.y * sp;
  const y1 = p3.x * sp + p3.y * cp;
  const z1 = p3.z;
  const x2 = x1 * ct + z1 * st;
  const y2 = y1;
  const z2 = -x1 * st + z1 * ct;
  return { x: x2, y: y2, z: z2 };
}

/**
 * Declared κ modulation of d4 (identity at κ=0). Soft caustic aperture weight.
 * Does not invent a new print formula — scale factor only.
 * @param {number} d4
 * @param {number} kappa
 */
export function d4WithKappa(d4, kappa) {
  // κ=0 → classic; small positive κ gently increases focal distance (observation).
  return d4 * (1 + 0.1 * kappa);
}

/**
 * Clamp observation params into a finite safe envelope (does not alter SoT).
 * @param {import("./ProjectionState.js").ProjectionStateInit|ReturnType<typeof createProjectionState>} state
 */
export function clampExtremeParams(state) {
  const lim = EXTREME_PARAM_LIMITS;
  const clamp = (v, limAbs) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(-limAbs, Math.min(limAbs, v));
  };
  const kappaRaw = state.kappa ?? 0;
  const kappa = !Number.isFinite(kappaRaw)
    ? 0
    : Math.max(0, Math.min(lim.kappa, kappaRaw));
  return {
    ...state,
    theta: clamp(state.theta ?? 0, lim.theta),
    phi: clamp(state.phi ?? 0, lim.phi),
    tau: clamp(state.tau ?? 0, lim.tau),
    kappa,
  };
}

/**
 * Evaluate continuous projection map → ProjectionState.
 * @param {number} theta
 * @param {number} phi
 * @param {number} tau
 * @param {number} kappa
 * @param {import("./ProjectionState.js").ProjectionStateInit} [base]
 */
export function evaluateContinuousP(theta, phi, tau, kappa, base = {}) {
  return createProjectionState({
    ...base,
    theta,
    phi,
    tau,
    kappa,
    d4: base.d4 ?? 4,
    d3: base.d3 ?? 4,
    status: base.status ?? "partial",
  });
}

/**
 * Project a 4D point through P(θ,φ,τ,κ) using Projector4D fidelity at κ=τ=θ=φ=0.
 *
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {ReturnType<typeof createProjectionState>} state
 * @returns {{ p3: {x:number,y:number,z:number}, screen: {sx:number,sy:number}, wFactor: number }}
 */
export function projectPointContinuous(point, state) {
  const d4 = d4WithKappa(state.d4, state.kappa);
  const denom = d4 + effectiveW(point.w, state.tau);
  // Near singularity: fall through to safe path without claiming print authority.
  if (!(Math.abs(denom) > 1e-12)) {
    return projectPointContinuousSafe(point, state);
  }
  const wFactor = d4 / denom;
  const raw3 = {
    x: point.x * wFactor,
    y: point.y * wFactor,
    z: point.z * wFactor,
  };
  const oriented = applyViewOrientation(raw3, state.theta, state.phi);
  const projector = new Projector4D({
    ...toProjectorOptions(state),
    d4,
  });
  // Feed oriented 3D through the same 3D→2D closed form as Projector4D.
  const screen = projector.project3Dto2D(vec4(oriented.x, oriented.y, oriented.z, 0));
  return { p3: oriented, screen, wFactor };
}

/**
 * Graceful projection: clamps extreme params and avoids non-finite screen samples.
 * Observation assist only — printSoT remains false.
 *
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {ReturnType<typeof createProjectionState>|import("./ProjectionState.js").ProjectionStateInit} stateInit
 */
export function projectPointContinuousSafe(point, stateInit) {
  const clamped = clampExtremeParams(stateInit);
  const state = createProjectionState({
    ...clamped,
    kappa: Math.max(0, clamped.kappa ?? 0),
  });
  let d4 = d4WithKappa(state.d4, state.kappa);
  if (!(d4 > 1e-9)) d4 = 1e-9;
  let denom = d4 + effectiveW(point.w, state.tau);
  if (!(Math.abs(denom) > 1e-9)) {
    denom = denom >= 0 ? 1e-9 : -1e-9;
  }
  const wFactor = d4 / denom;
  const raw3 = {
    x: point.x * wFactor,
    y: point.y * wFactor,
    z: point.z * wFactor,
  };
  const oriented = applyViewOrientation(raw3, state.theta, state.phi);
  const projector = new Projector4D({
    ...toProjectorOptions(state),
    d4,
  });
  const screen = projector.project3Dto2D(vec4(oriented.x, oriented.y, oriented.z, 0));
  const sx = Number.isFinite(screen.sx) ? screen.sx : 0;
  const sy = Number.isFinite(screen.sy) ? screen.sy : 0;
  return {
    p3: oriented,
    screen: { sx, sy },
    wFactor,
    degraded: true,
    printSoT: false,
    authority: "observation",
  };
}

/**
 * Closed-form expected 4D→3D when θ=φ=τ=κ=0 (must match Projector4D).
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {number} d4
 */
export function classic4Dto3D(point, d4) {
  const f = d4 / (d4 + point.w);
  return { x: point.x * f, y: point.y * f, z: point.z * f };
}
