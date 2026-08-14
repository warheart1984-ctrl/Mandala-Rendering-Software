/**
 * BranchingOperator — B = R ∘ A ∘ E.
 *
 *   State → Expansion → Association → Refinement → New Branch State
 *
 * Also draws the branch factor k from a power-law distribution
 * P(k) ∝ k^-α (exponent configurable, never hard-coded).
 *
 * Status: enforced (verified by branching tests).
 */

import { expand } from "./ExpansionOperator.js";
import { associate } from "./AssociationOperator.js";
import { refine } from "./RefinementOperator.js";
import { deriveSeed, mulberry32 } from "../determinism/SeedManager.js";

/**
 * Sample a branch factor k ∈ [kmin, kmax] with P(k) ∝ k^-α.
 * Inverse-CDF sampling — deterministic under a fixed RNG stream.
 */
export function sampleBranchFactor(rng, config) {
  const kmin = Math.max(1, config.minBranchFactor);
  const kmax = Math.max(kmin, config.maxBranchFactor);
  const weights = [];
  let total = 0;
  for (let k = kmin; k <= kmax; k++) {
    const w = Math.pow(k, -config.branchingExponent);
    weights.push(w);
    total += w;
  }
  let u = rng.next() * total;
  for (let k = kmin; k <= kmax; k++) {
    u -= weights[k - kmin];
    if (u < 0) return k;
  }
  return kmax;
}

/**
 * Execute B = R(A(E(parent, rng))) and return refined child descriptors.
 *
 * @param {object} parent node
 * @param {number} parentSeed node generation seed
 * @param {object} config
 * @returns {{children: object[], branchFactor: number, seed: number}}
 */
export function branch(parent, parentSeed, config) {
  const branchFactor = sampleBranchFactor(
    { next: mulberry32(deriveSeed(parentSeed, 0, 3)) },
    config,
  );

  const expanded = [];
  for (let i = 0; i < branchFactor; i++) {
    const rng = { next: mulberry32(deriveSeed(parentSeed, i + 1, 3)) };
    expanded.push(expand(parent, i, rng, config));
  }

  const associations = associate(expanded, config);
  const children = refine(expanded, associations);

  return { children, branchFactor, seed: deriveSeed(parentSeed, branchFactor, 3) };
}

export const BRANCHING_OPERATOR_ID = "branching.power-law.v1";