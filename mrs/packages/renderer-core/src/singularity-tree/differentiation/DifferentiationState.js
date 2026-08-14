/**
 * DifferentiationState — the generative state at a refinement level.
 *
 * χ = differentiation potential (state magnitude). The state vector lives in
 * M4; potential is its norm. Refinement is only permitted while χ > χc.
 *
 * Status: enforced (verified by differentiation tests + invariant 4).
 */

import { hashState } from "../determinism/StateHasher.js";

export function createDifferentiationState({
  state,
  potential,
  level,
  scale = 1.0,
  parameters = {},
}) {
  const record = {
    state,
    potential,
    level,
    scale,
    parameters: Object.freeze({ ...parameters }),
  };
  return Object.freeze({
    ...record,
    stateHash: hashState(record).slice(0, 16),
  });
}