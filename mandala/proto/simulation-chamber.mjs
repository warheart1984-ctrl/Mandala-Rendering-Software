/**
 * Simulation Chamber (proto) — owns temporal evolution of certified spacetime.
 *
 * Distinct from `scripts/simulation-chamber.mjs` pose fallback (`--solver pose`).
 * Default cinematic path (`--solver mandala-proto`) maps this integrator's
 * −∇φ defect walk onto actor world positions. Field update is lattice
 * Hamiltonian gradient flow (−∇H); default coupling recovers Laplacian.
 *
 * Movie Lane does not own time. Chamber advances t. Movie Lane only samples it.
 *
 * Status: **partial**
 */

import { DEFAULT_CONSTITUTION } from "./constitution.mjs";
import { cpuProposeNext, createProposalBuffers } from "./cpu-reference.mjs";
import { evaluateProposal, makeProposal } from "./aais-gate.mjs";
import { rehash, storeSlice } from "./certified-state.mjs";
import { CHAMBER_GRAD_V_STATUS as CINEMATIC_CHAMBER_GRAD_V } from "../substrate/chamber-hook.mjs";

export const PROTO_CHAMBER_STATUS = "partial";
export const PROTO_MOTION_DRIVER = "cpu_reference_transport";
export const PROTO_PHYSICS_OPERATOR = "lattice-hamiltonian";

export function describeProtoChamber() {
  return {
    organ: "SimulationChamber",
    status: PROTO_CHAMBER_STATUS,
    motionDriver: PROTO_MOTION_DRIVER,
    cinematicChamberStillPoseInterp: CINEMATIC_CHAMBER_GRAD_V,
    note:
      "This proto Chamber evolves certified 32³×64 state. scripts/simulation-chamber.mjs defaults to the same transport for actor translation; --solver pose remains beat lerp.",
  };
}

export function createChamber(constitution = DEFAULT_CONSTITUTION) {
  return {
    organ: "SimulationChamber",
    constitution,
    buffers: createProposalBuffers(),
  };
}

/**
 * Propose one lawful step. Does not commit.
 */
export function proposeStep(chamber, certified, extraProvenance = {}) {
  cpuProposeNext(certified, chamber.constitution, chamber.buffers);
  const proposed_delta = {
    t: chamber.buffers.t,
    scalar: chamber.buffers.scalar,
    vector: chamber.buffers.vector,
    defect: chamber.buffers.defect,
  };
  return makeProposal({
    source: "SimulationChamber",
    certified,
    proposed_delta,
    numerical_error_bound: chamber.constitution.invariant.numericalErrorBound,
    provenance: {
      organ: "SimulationChamber",
      kernel: "cpu-reference",
      operator: "lattice-hamiltonian",
      t: certified.t,
      tNext: proposed_delta.t,
      ...extraProvenance,
    },
  });
}

/**
 * Gate then commit. On reject, certified buffers are unchanged.
 */
export function commitProposal(certified, proposal, constitution) {
  const decision = evaluateProposal(certified, proposal, constitution);
  if (!decision.accepted) {
    return { committed: false, decision, hash: certified.hash };
  }
  const d = proposal.proposed_delta;
  if (d.t >= certified.shape.nt) {
    return {
      committed: false,
      decision: {
        ...decision,
        accepted: false,
        rejected: true,
        reasons: [...decision.reasons, { code: "temporal-cache-full", detail: `t=${d.t}` }],
      },
      hash: certified.hash,
    };
  }
  certified.scalar.set(d.scalar);
  certified.vector.set(d.vector);
  certified.defect = { ...d.defect };
  certified.t = d.t;
  certified.observer = { ...certified.observer, t: d.t };
  storeSlice(certified, d.t);
  rehash(certified);
  return { committed: true, decision, hash: certified.hash };
}

export function stepCertified(chamber, certified) {
  const proposal = proposeStep(chamber, certified);
  return { proposal, ...commitProposal(certified, proposal, chamber.constitution) };
}

export function evolveTo(chamber, certified, tTarget) {
  const receipts = [];
  while (certified.t < tTarget) {
    const r = stepCertified(chamber, certified);
    receipts.push(r);
    if (!r.committed) break;
  }
  return receipts;
}

/**
 * Illegal mass-injection proposal for tests. Must be rejected; must not mutate.
 */
export function proposeIllegalMassInjection(certified, constitution) {
  const scalar = new Float32Array(certified.scalar);
  for (let i = 0; i < scalar.length; i++) scalar[i] += 1;
  const vector = new Float32Array(certified.vector);
  const proposed_delta = {
    t: certified.t + 1,
    scalar,
    vector,
    defect: { ...certified.defect },
  };
  return makeProposal({
    source: "SimulationChamber",
    certified,
    proposed_delta,
    numerical_error_bound: constitution.invariant.numericalErrorBound,
    provenance: { organ: "SimulationChamber", intent: "illegal-mass-injection-test" },
  });
}
