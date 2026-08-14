/**
 * AssociationOperator — A: creates relationships between states.
 *
 * Sibling states whose normalized directions are close on S³ are associated
 * (relational graph). Association must preserve causal lineage: it never
 * alters parent/child structure, it only adds sibling links.
 *
 * Status: enforced (verified by branching tests).
 */

export function angularSeparation(a, b) {
  const na = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w) || 1e-12;
  const nb = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z + b.w * b.w) || 1e-12;
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / (na * nb);
  const clamped = Math.max(-1, Math.min(1, cos));
  return Math.acos(clamped);
}

/**
 * Associate sibling expanded states by angular proximity.
 * @param {object[]} expanded list of expansion results (in child order)
 * @param {object} config
 * @returns {Array<Array<{index:number,separation:number}>>} per-child association list
 */
export function associate(expanded, config) {
  const threshold = (config.siblingAssociationAngle * Math.PI) / 180;
  const associations = expanded.map(() => []);
  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      const sep = angularSeparation(
        expanded[i].childState.state,
        expanded[j].childState.state,
      );
      if (sep <= threshold) {
        associations[i].push({ withIndex: j, separation: sep });
        associations[j].push({ withIndex: i, separation: sep });
      }
    }
  }
  return associations;
}

export const ASSOCIATION_OPERATOR_ID = "association.sibling-proximity.v1";