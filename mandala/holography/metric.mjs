/**
 * Spacetime metric helpers for Mandala holography (Claim A — computational only).
 *
 * Projection SoT: ./projector.mjs (P: R^{1,3}→R^3, induced h_ij, unit-normal h_μν).
 * This module wraps conformal-on-slice helpers and re-exports Minkowski constants.
 *
 * Not GR solver. Not AdS/CFT. Status: **partial**
 */

import {
  c as PROJECTOR_C,
  g_munu,
  inducedMetricHij,
  projectNaive,
  spatialDistanceH,
  flatInducedDelta,
} from "./projector.mjs";

/** Component order for 4-metric indices: 0=t, 1=x, 2=y, 3=z */
export const METRIC_INDEX = Object.freeze({ t: 0, x: 1, y: 2, z: 3 });

/** Alias: Minkowski η ≡ g_μν from projector SoT (c=1 → diag(−1,1,1,1)). */
export const MINKOWSKI_ETA = g_munu;

export const MINKOWSKI_C = PROJECTOR_C;

export const INDUCED_METRIC_IDS = Object.freeze({
  FLAT_DELTA: "adm-minkowski-flat-delta",
  CONFORMAL_PHI: "adm-conformal-phi",
});

/**
 * ds² for displacement (dt, dx, dy, dz) under Minkowski η (c=1).
 */
export function minkowskiIntervalSquared({ dt = 0, dx = 0, dy = 0, dz = 0 } = {}) {
  const c = MINKOWSKI_C;
  return -c * c * dt * dt + dx * dx + dy * dy + dz * dz;
}

/**
 * ADM induced spatial 3-metric from a general 4-metric g_μν (row-major 16).
 * h_ij = g_ij − g_0i g_0j / g_00
 *
 * Defaults: if g4 omitted, use MINKOWSKI_ETA → h = δ_ij.
 * Optional lapse/shift defaults N=1, N^i=0 are already encoded by diagonal Minkowski.
 *
 * @param {Float64Array|ArrayLike<number>} [g4] — length 16, row-major
 * @returns {{ h: Float64Array, id: string, g00: number, note: string }}
 *   h is row-major 3×3 (indices i,j ∈ {x,y,z} = {0,1,2})
 */
export function inducedMetric3(g4 = MINKOWSKI_ETA) {
  const h = inducedMetricHij(g4);
  const g00 = +g4[0];
  const isDelta =
    Math.abs(h[0] - 1) < 1e-12 &&
    Math.abs(h[4] - 1) < 1e-12 &&
    Math.abs(h[8] - 1) < 1e-12 &&
    Math.abs(h[1]) < 1e-12 &&
    Math.abs(h[2]) < 1e-12 &&
    Math.abs(h[3]) < 1e-12 &&
    Math.abs(h[5]) < 1e-12 &&
    Math.abs(h[6]) < 1e-12 &&
    Math.abs(h[7]) < 1e-12;
  return {
    h,
    id: isDelta ? INDUCED_METRIC_IDS.FLAT_DELTA : "adm-general-g4",
    g00,
    note: "ADM-inspired induced metric via projector.inducedMetricHij — Claim A only",
  };
}

/**
 * Spatial 3-metric on a constant-t slice of bulk φ.
 * Flat default: h = δ. Optional conformal: h_ij = Ω²(φ̄) δ_ij where φ̄ is slice mean.
 *
 * @param {{ scalar?: Float32Array|ArrayLike<number>, shape?: object }} [bulk]
 * @param {number} [t] — slice index (documented; conformal uses live scalar unless opts.phi)
 * @param {{ conformal?: boolean, omegaFromPhi?: (phiMean:number)=>number, phi?: ArrayLike<number> }} [opts]
 */
export function inducedMetricOnSlice(bulk = {}, t = 0, opts = {}) {
  void t;
  const base = inducedMetric3(MINKOWSKI_ETA);
  if (!opts.conformal) {
    return {
      ...base,
      t: t | 0,
      omega: 1,
      conformal: false,
    };
  }
  const phi = opts.phi ?? bulk.scalar;
  let mean = 0;
  let n = 0;
  if (phi && phi.length) {
    for (let i = 0; i < phi.length; i++) mean += phi[i];
    n = phi.length;
    mean = n ? mean / n : 0;
  }
  const omegaFn =
    typeof opts.omegaFromPhi === "function"
      ? opts.omegaFromPhi
      : (m) => 1 + 0.05 * Math.tanh(m);
  const omega = omegaFn(mean);
  const o2 = omega * omega;
  const h = new Float64Array(9);
  h[0] = o2;
  h[4] = o2;
  h[8] = o2;
  return {
    h,
    id: INDUCED_METRIC_IDS.CONFORMAL_PHI,
    g00: -1,
    omega,
    phiMean: mean,
    conformal: true,
    t: t | 0,
    note: "Conformal Ω²(φ)δ_ij — computational stand-in for curvature→boundary metric, not Einstein h",
  };
}

/**
 * Naive coordinate drop — delegates to projector.projectNaive (SoT).
 * Insufficient alone as a holographic map.
 */
export function naiveProjectDropTime(point4) {
  const p = projectNaive(point4);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    dropped: { t: point4.t ?? point4.w ?? point4[0] ?? 0 },
    warning: p.warning,
    insufficientAlone: true,
  };
}

export { spatialDistanceH, flatInducedDelta };

/**
 * Light-sheet / null-constraint stub: |Δx| ≤ c |Δt| (lattice units, c=1).
 * Declared helper for reconstruct receipts — not a continuum null geodesic solver.
 */
export function nullConstraintOk(dx, dy, dz, dt, c = MINKOWSKI_C) {
  const spatial = Math.hypot(dx, dy, dz);
  return spatial <= Math.abs(c * dt) + 1e-9;
}
