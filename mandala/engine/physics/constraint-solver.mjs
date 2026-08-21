/**
 * Constraint solver — mass conservation (proto) + no superluminal defect speed.
 * Optional φ clamp that conserves mass.
 * Status: **partial**
 */

import { scalarMass } from "../../proto/certified-state.mjs";
import { chebyshev } from "./collision-manifold.mjs";

export const CONSTRAINT_STATUS = "partial";
export const CONSTRAINT_MASS = "proto.scalar-mass-conservation";
export const CONSTRAINT_CAUSALITY = "mandala.engine.no-superluminal-defect";
export const CONSTRAINT_PHI_CLAMP = "mandala.engine.phi-clamp-mass-conserving";

export function maxDefectStep(constitution) {
  return constitution?.causality?.maxDefectStep ?? 1;
}

export function checkMassConservation(prevScalar, nextScalar, bound) {
  const prev = scalarMass(prevScalar);
  const next = scalarMass(nextScalar);
  const delta = Math.abs(next - prev);
  return {
    id: CONSTRAINT_MASS,
    ok: delta <= bound,
    prevMass: prev,
    nextMass: next,
    delta,
    bound,
  };
}

/**
 * Defect may move at most `maxStep` cells (Chebyshev) per certified dt.
 * Superluminal teleports are unlawful in this universe.
 */
export function checkCausality(prevDefect, nextDefect, maxStep = 1) {
  const d = chebyshev(prevDefect, nextDefect);
  return {
    id: CONSTRAINT_CAUSALITY,
    ok: d <= maxStep,
    chebyshev: d,
    maxStep,
  };
}

/**
 * Clamp φ into [lo, hi] then shift by a constant so Σφ is unchanged.
 */
export function clampPhiConservingMass(scalar, lo = -8, hi = 8) {
  const out = new Float32Array(scalar);
  const mass0 = scalarMass(out);
  for (let i = 0; i < out.length; i++) {
    if (out[i] < lo) out[i] = lo;
    else if (out[i] > hi) out[i] = hi;
  }
  const mass1 = scalarMass(out);
  const shift = (mass0 - mass1) / out.length;
  for (let i = 0; i < out.length; i++) out[i] += shift;
  return { scalar: out, id: CONSTRAINT_PHI_CLAMP, mass0, mass1: scalarMass(out) };
}

export function evaluateConstraints(certified, proposed_delta, constitution) {
  const bound = constitution.invariant.numericalErrorBound;
  const mass = checkMassConservation(certified.scalar, proposed_delta.scalar, bound);
  const causality = checkCausality(
    certified.defect,
    proposed_delta.defect,
    maxDefectStep(constitution),
  );
  const reasons = [];
  if (!mass.ok) {
    reasons.push({
      code: mass.id,
      detail: `|Δmass|=${mass.delta} > ${mass.bound}`,
    });
  }
  if (!causality.ok) {
    reasons.push({
      code: causality.id,
      detail: `defect Chebyshev ${causality.chebyshev} > maxStep ${causality.maxStep}`,
    });
  }
  return { mass, causality, reasons, ok: reasons.length === 0 };
}
