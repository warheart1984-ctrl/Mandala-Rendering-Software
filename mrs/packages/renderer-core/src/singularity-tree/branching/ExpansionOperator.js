/**
 * ExpansionOperator — E: introduces new degrees of freedom.
 *
 * Expansion adds geometric parameters/state variables without implying
 * geometric realization: each child gains angular DOFs (θ₁ in the xy plane,
 * θ₂ in the zw plane) and a scale factor s, which are the new DOFs the
 * branch explores.
 *
 * Status: enforced (verified by branching tests).
 */

import { computeDifferentiationState } from "../differentiation/DifferentiationEngine.js";

export function expand(parentNode, childIndex, rng, config) {
  const spread = 2 * Math.PI;
  const theta1 = rng.next() * spread;
  const theta2 = rng.next() * spread;

  // Scale: power-law-biased toward smaller scales -> self-similar but not
  // identical branches (same generative law, different local state).
  const u = rng.next();
  const t = Math.pow(u, config.branchingExponent);
  const scale = config.scaleMin + (config.scaleMax - config.scaleMin) * t;

  const childState = computeDifferentiationState(
    parentNode,
    scale,
    theta1,
    theta2,
    parentNode.level + 1,
  );

  return {
    index: childIndex,
    scale,
    theta1,
    theta2,
    childState,
    degreesOfFreedom: (parentNode.generationMetadata?.dof || 2) + 2,
  };
}

export const EXPANSION_OPERATOR_ID = "expansion.rotate-scale.v1";