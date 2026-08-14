/**
 * ThresholdEvaluator — the gate χ > χc.
 *
 * Differentiation is permitted only when χ > χc. When χ <= χc the branch
 * must not create a new refinement level (it terminates and realizes local
 * geometry instead).
 *
 * Status: enforced (verified by differentiation tests + invariant 4).
 */

export function evaluateDifferentiation(differentiationState, criticalThreshold) {
  const chi = differentiationState.potential;
  const chiC = criticalThreshold;
  return {
    chi,
    chiC,
    differentiate: chi > chiC,
    margin: chi - chiC,
    terminated: chi <= chiC,
  };
}

export function canDifferentiate(chi, chiC) {
  return chi > chiC;
}