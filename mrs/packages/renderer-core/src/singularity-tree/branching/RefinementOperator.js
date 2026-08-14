/**
 * RefinementOperator — R: local sharpening of an associated state.
 *
 * Refinement increases information without arbitrarily destroying topology:
 * it finalizes child descriptors with subdivision metadata (level index,
 * local resolution hint). Geometry sharpening happens at the leaf layer;
 * this operator records the refinement law each child obeys.
 *
 * Status: enforced (verified by branching tests).
 */

export function refine(expanded, associations) {
  return expanded.map((e, i) => ({
    ...e,
    refinement: {
      subdivision: e.childState.level,
      localResolutionHint: 1 / (e.scale || 1e-9),
      associations: associations[i],
    },
  }));
}

export const REFINEMENT_OPERATOR_ID = "refinement.subdivision.v1";