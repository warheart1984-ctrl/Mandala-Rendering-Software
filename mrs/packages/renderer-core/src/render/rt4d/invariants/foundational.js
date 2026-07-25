/**
 * Foundational constitutional math invariants (PI-*).
 *
 * These are the Mathematical Theory → Constitutional Invariants layer.
 * They stay independent of any runtime host; 4DRS engine invariants
 * declare derived_from → these IDs.
 *
 * Status vocabulary (Drive-G-1):
 *   enforced — unit tests + runtime gate
 *   tested   — unit tests pass; no runtime gate
 *   declared — specified only
 *   skeleton — stub / type only
 */

import {
  PHYSICAL_INVARIANT_TOL,
  PHYSICAL_INVARIANTS,
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
  invariantPredicateResult,
} from "../math/physicalInvariants.js";

/** @typedef {"enforced"|"tested"|"declared"|"skeleton"} InvariantStatus */

/**
 * @typedef {object} FoundationalInvariant
 * @property {string} id
 * @property {"foundational"} layer
 * @property {"geometry"|"calculus"|"trigonometry"} branch
 * @property {string} statement
 * @property {string} predicate
 * @property {InvariantStatus} status
 * @property {string[]} evidence
 * @property {string[]} [derived_from]
 */

/**
 * PI-* catalog registered as foundational constitutional math invariants.
 * Predicates remain in physicalInvariants.js (single SoT for formulas).
 *
 * @type {readonly FoundationalInvariant[]}
 */
export const FOUNDATIONAL_INVARIANTS = Object.freeze(
  PHYSICAL_INVARIANTS.map((inv) =>
    Object.freeze({
      id: inv.id,
      layer: /** @type {const} */ ("foundational"),
      branch: inv.branch,
      statement: inv.statement,
      predicate: inv.predicate,
      status: /** @type {InvariantStatus} */ (inv.status),
      evidence: Object.freeze([
        "src/render/rt4d/math/physicalInvariants.js",
        "src/render/rt4d/test/physicalInvariants.test.js",
      ]),
      derived_from: Object.freeze([]),
    }),
  ),
);

/**
 * @param {string} id
 * @returns {FoundationalInvariant|undefined}
 */
export function getFoundationalInvariant(id) {
  return FOUNDATIONAL_INVARIANTS.find((inv) => inv.id === id);
}

export {
  PHYSICAL_INVARIANT_TOL,
  PHYSICAL_INVARIANTS,
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
  invariantPredicateResult,
};
