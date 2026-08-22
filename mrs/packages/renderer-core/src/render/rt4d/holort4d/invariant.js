/**
 * HOLORT4D-MC-LINEAR — existing predicate style {id, ok, evidence}.
 * Physical validity stays declared.
 */

import { accumulateAtomic, complexContrib } from "./accumulate.js";

export const HOLORT4D_MC_LINEAR_ID = "HOLORT4D-MC-LINEAR";

export const HOLORT4D_MC_LINEAR = Object.freeze({
  id: HOLORT4D_MC_LINEAR_ID,
  branch: "wave-optics",
  statement:
    "A hologram is a Monte Carlo integral over complex amplitudes. The accumulator must be linear, deterministic, and race-free.",
  predicate: "complexSumLinear",
  status: "tested",
  physical: "declared",
  contract: "wave-optics",
});

export function invariantPredicateResult(id, ok, evidence = {}) {
  return { id, ok: !!ok, evidence };
}

export function complexSumLinear(contribs, summed, tol = 1e-12) {
  let re = 0;
  let im = 0;
  for (const c of contribs) {
    re += c.real;
    im += c.imag;
  }
  return Math.abs(summed.real - re) < tol && Math.abs(summed.imag - im) < tol;
}

/**
 * Two paths → same pixel. Order A then B equals B then A (commutativity of +).
 */
export function checkLinearity(samples, camera, pixelIndex = 0) {
  const contribs = samples.map((s) => complexContrib(s, camera.lambda));
  const fieldAB = [{ real: 0, imag: 0 }];
  const fieldBA = [{ real: 0, imag: 0 }];
  const tagged = samples.map((s) => ({ ...s, pixelIndex }));
  accumulateAtomic(fieldAB, tagged, camera);
  accumulateAtomic(fieldBA, [...tagged].reverse(), camera);
  const linear = complexSumLinear(contribs, fieldAB[0]);
  const commutative =
    Math.abs(fieldAB[0].real - fieldBA[0].real) < 1e-12 &&
    Math.abs(fieldAB[0].imag - fieldBA[0].imag) < 1e-12;
  return invariantPredicateResult(HOLORT4D_MC_LINEAR_ID, linear && commutative, {
    linear,
    commutative,
    ab: fieldAB[0],
    ba: fieldBA[0],
    physical: "declared",
  });
}
