/**
 * AAIS-shaped constitutional gate for the proto.
 *
 * Law: no subsystem may commit a state transition that violates constitutional invariants.
 * Rejected proposals do not mutate certified state.
 *
 * Status: **partial** — one invariant enforced (scalar mass conservation).
 * Full AAIS arbitration / provenance bus is **declared**.
 */

import { INVARIANT_ID } from "./constitution.mjs";
import { scalarMass } from "./certified-state.mjs";

export const AAIS_STATUS = "partial";

export function conservedQuantities(scalar) {
  return { scalarMass: scalarMass(scalar) };
}

/**
 * @typedef {object} Proposal
 * @property {"SimulationChamber"|"StoryForge"|"Mandala"|"MovieLane"|"AIPainter"|"Mythar"|"AAIS"} source
 * @property {string} previous_state_hash
 * @property {{ t: number, scalar: Float32Array, vector: Float32Array, defect: object }} proposed_delta
 * @property {{ scalarMass: number }} conserved_quantities
 * @property {{ maxDefectStep: number }} causality_bounds
 * @property {number} numerical_error_bound
 * @property {object} provenance
 */

export function evaluateProposal(certified, proposal, constitution) {
  const reasons = [];
  if (proposal.previous_state_hash !== certified.hash) {
    reasons.push({
      code: "stale-predecessor",
      detail: "proposal.previous_state_hash does not match certified.hash",
    });
  }

  const bound = proposal.numerical_error_bound ?? constitution.invariant.numericalErrorBound;
  const prevMass = scalarMass(certified.scalar);
  const nextMass = proposal.conserved_quantities?.scalarMass;
  const measured = scalarMass(proposal.proposed_delta.scalar);
  if (typeof nextMass === "number" && Math.abs(nextMass - measured) > bound) {
    reasons.push({
      code: "conserved-quantity-misreported",
      detail: `declared mass ${nextMass} != measured ${measured}`,
    });
  }
  if (Math.abs(measured - prevMass) > bound) {
    reasons.push({
      code: INVARIANT_ID,
      detail: `|Δmass|=${Math.abs(measured - prevMass)} > ${bound} (prev=${prevMass}, next=${measured})`,
    });
  }

  const accepted = reasons.length === 0;
  return {
    organ: "AAIS",
    status: AAIS_STATUS,
    accepted,
    rejected: !accepted,
    invariantId: INVARIANT_ID,
    constitutionId: constitution.id,
    reasons,
    prevMass,
    nextMass: measured,
  };
}

export function makeProposal({
  source = "SimulationChamber",
  certified,
  proposed_delta,
  causality_bounds = { maxDefectStep: 1 },
  numerical_error_bound,
  provenance = {},
}) {
  return {
    source,
    previous_state_hash: certified.hash,
    proposed_delta,
    conserved_quantities: conservedQuantities(proposed_delta.scalar),
    causality_bounds,
    numerical_error_bound,
    provenance,
  };
}
