/**
 * RefinementLevel — symbolic layer names L0..L5 and level helpers.
 *
 * L0 ROOT → L1 HIERARCHY → L2 BRANCHING → L3 REFINEMENT → L4 LOCAL GEOMETRY
 * → L5 CONTINUUM.
 *
 * Invariant 3: child.level = parent.level + 1 (monotonic refinement).
 *
 * Status: enforced (verified by hierarchy + failure tests).
 */

export const REFINEMENT_LAYERS = Object.freeze({
  L0_ROOT: 0,
  L1_HIERARCHY: 1,
  L2_BRANCHING: 2,
  L3_REFINEMENT: 3,
  L4_LOCAL_GEOMETRY: 4,
  L5_CONTINUUM: 5,
});

export function layerName(level) {
  const names = ["ROOT", "HIERARCHY", "BRANCHING", "REFINEMENT", "LOCAL_GEOMETRY", "CONTINUUM"];
  if (level >= 0 && level < names.length) return names[level];
  return `REFINEMENT_${level}`;
}

export function assertMonotonicRefinement(parent, child) {
  if (child.level !== parent.level + 1) {
    throw new Error(
      `Invariant 3 violated: child ${child.id} level ${child.level} must be parent level + 1 (${parent.level + 1})`,
    );
  }
  return true;
}