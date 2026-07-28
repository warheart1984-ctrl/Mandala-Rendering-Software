/**
 * ProjCC invariants — catalog + predicates.
 *
 * SoT: Projector4D (`rt4d/output/projector.js`). Continuity layer ≠ print SoT.
 * Status: enforced for unit-proven fidelity/continuity/kappa/aperture-metadata;
 * runtime CKL charter gate remains separate (partial via projectionGovernance).
 */

import { PHYSICAL_INVARIANT_TOL } from "../math/physicalInvariants.js";
import { Projector4D } from "../output/projector.js";
import { createProjectionState } from "./ProjectionState.js";
import {
  projectPointContinuous,
  projectPointContinuousSafe,
  classic4Dto3D,
  d4WithKappa,
} from "./continuityMath.js";

/** @typedef {"enforced"|"partial"|"declared"|"skeleton"|"tested"} InvariantStatus */

/**
 * @type {readonly object[]}
 */
export const PCC_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "PCC-FIDELITY-ZERO",
    title: "Zero-param fidelity to Projector4D",
    statement:
      "When θ=φ=τ=κ=0, continuous projection 4D→3D matches Projector4D / classic d4/(d4+w).",
    status: /** @type {InvariantStatus} */ ("enforced"),
    evidence: Object.freeze([
      "projection/continuityMath.js",
      "output/projector.js",
      "test/projection.invariants.test.js",
    ]),
    notEnforcedBecause: null,
    note: "Unit-suite enforced; Projector4D remains math SoT.",
  }),
  Object.freeze({
    id: "PCC-CONTINUITY-LIPSCHITZ",
    title: "Local continuity in observation parameters",
    statement:
      "Away from d4+w_eff=0, small Δ(θ,φ,τ,κ) produce bounded Δ in screen coordinates.",
    status: /** @type {InvariantStatus} */ ("enforced"),
    evidence: Object.freeze([
      "test/projection.continuity.test.js",
      "test/projection.kernel.strength.test.js",
    ]),
    notEnforcedBecause: null,
  }),
  Object.freeze({
    id: "PCC-KAPPA-IDENTITY",
    title: "κ=0 identity",
    statement: "κ=0 must not alter d4 effective scale (d4WithKappa(d4,0)===d4).",
    status: /** @type {InvariantStatus} */ ("enforced"),
    evidence: Object.freeze(["projection/continuityMath.js"]),
    notEnforcedBecause: null,
  }),
  Object.freeze({
    id: "PCC-APERTURE-NE-PRINT",
    title: "Aperture ≠ print SoT",
    statement:
      "ApertureFrame3D / ProjCC aperture APIs must not replace CPU RT4D print sovereignty.",
    status: /** @type {InvariantStatus} */ ("enforced"),
    evidence: Object.freeze([
      "docs/4d-engine/projection/PROJECTION_CONTINUITY_CONTRACT.md",
      "projection/ApertureFrame3D.js",
      "test/projection.invariants.test.js",
    ]),
    notEnforcedBecause: null,
    note: "Metadata printSoT:false / authority:observation asserted in tests.",
  }),
  Object.freeze({
    id: "PCC-RUNTIME-CKL",
    title: "Runtime CKL charter gate for ProjCC",
    statement:
      "Charter default.policies.json row for ProjCC — not claimed as enforced.",
    status: /** @type {InvariantStatus} */ ("declared"),
    evidence: Object.freeze(["projection/projectionGovernance.js"]),
    notEnforcedBecause:
      "Package-local projectionGovernance is partial; charter policies untouched.",
  }),
]);

/**
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {import("./ProjectionState.js").ProjectionStateInit} [opts]
 * @param {number} [tol]
 */
export function pccFidelityZeroHolds(point, opts = {}, tol = PHYSICAL_INVARIANT_TOL) {
  const state = createProjectionState({
    ...opts,
    theta: 0,
    phi: 0,
    tau: 0,
    kappa: 0,
  });
  const continuous = projectPointContinuous(point, state);
  const classic = classic4Dto3D(point, state.d4);
  const projector = new Projector4D({
    d4: state.d4,
    d3: state.d3,
    scale: state.scale,
    width: state.width,
    height: state.height,
  });
  const actual = projector.project4Dto3D(point);
  const okCont =
    Math.abs(continuous.p3.x - classic.x) < tol &&
    Math.abs(continuous.p3.y - classic.y) < tol &&
    Math.abs(continuous.p3.z - classic.z) < tol;
  const okProj =
    Math.abs(actual.x - classic.x) < tol &&
    Math.abs(actual.y - classic.y) < tol &&
    Math.abs(actual.z - classic.z) < tol;
  return {
    ok: okCont && okProj,
    continuous: continuous.p3,
    classic,
    projector3d: { x: actual.x, y: actual.y, z: actual.z },
  };
}

/**
 * Finite-difference continuity probe.
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {object} [opts]
 */
export function pccContinuityHolds(point, opts = {}) {
  const eps = opts.eps ?? 1e-4;
  const bound = opts.bound ?? 50;
  const base = createProjectionState({
    theta: opts.theta ?? 0.2,
    phi: opts.phi ?? 0.3,
    tau: opts.tau ?? 0.1,
    kappa: opts.kappa ?? 0.05,
    d4: opts.d4 ?? 4,
    d3: opts.d3 ?? 4,
    scale: opts.scale ?? 80,
    width: opts.width ?? 640,
    height: opts.height ?? 480,
  });
  const a = projectPointContinuous(point, base).screen;
  const dims = ["theta", "phi", "tau", "kappa"];
  /** @type {object[]} */
  const steps = [];
  for (const dim of dims) {
    const patched = createProjectionState({ ...base, [dim]: base[dim] + eps });
    const b = projectPointContinuous(point, patched).screen;
    const dist = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    const lip = dist / eps;
    steps.push({ dim, dist, lip, ok: lip <= bound });
  }
  return { ok: steps.every((s) => s.ok), steps, bound, eps };
}

/**
 * Second-order finite-difference differentiability probe (smoothness).
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {object} [opts]
 */
export function pccDifferentiabilityHolds(point, opts = {}) {
  const eps = opts.eps ?? 1e-3;
  const bound = opts.bound ?? 5e4;
  const dim = opts.dim ?? "theta";
  const base = createProjectionState({
    theta: opts.theta ?? 0.25,
    phi: opts.phi ?? 0.2,
    tau: opts.tau ?? 0.05,
    kappa: opts.kappa ?? 0.1,
    width: opts.width ?? 640,
    height: opts.height ?? 480,
  });
  const s = (v) =>
    projectPointContinuous(point, createProjectionState({ ...base, [dim]: v })).screen;
  const v0 = base[dim];
  const ym = s(v0 - eps);
  const y0 = s(v0);
  const yp = s(v0 + eps);
  const d2x = (yp.sx - 2 * y0.sx + ym.sx) / (eps * eps);
  const d2y = (yp.sy - 2 * y0.sy + ym.sy) / (eps * eps);
  const mag = Math.hypot(d2x, d2y);
  const ok = Number.isFinite(mag) && mag <= bound;
  return { ok, mag, bound, dim, d2x, d2y };
}

/**
 * Extreme-param graceful degradation probe.
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {object} [opts]
 */
export function pccExtremeGracefulHolds(point, opts = {}) {
  const extreme = createProjectionState({
    theta: opts.theta ?? 1e6,
    phi: opts.phi ?? -1e6,
    tau: opts.tau ?? 1e6,
    kappa: opts.kappa ?? 1e6,
    width: 640,
    height: 480,
  });
  const r = projectPointContinuousSafe(point, extreme);
  const ok =
    Number.isFinite(r.screen.sx) &&
    Number.isFinite(r.screen.sy) &&
    r.printSoT === false &&
    r.authority === "observation";
  return { ok, result: r };
}

export function listPccInvariants() {
  return PCC_INVARIANTS.map((i) => ({ id: i.id, status: i.status, title: i.title }));
}

export { d4WithKappa };
