/**
 * Mandala Engine physics core (v0.2).
 * Only SimulationChamber may propose physics deltas.
 */

export const PHYSICS_CORE_STATUS = "partial";
export const PHYSICS_ABI_ID = "mandala-engine-physics.v0.2";

export {
  INTEGRATOR_STATUS,
  INTEGRATOR_DRIVER,
  INTEGRATOR_OPERATOR,
  integrateNext,
  createIntegratorBuffers,
} from "./temporal-integrator.mjs";
export {
  GRADIENT_FLOW_STATUS,
  evaluate as evaluateGradientFlow,
  describeGradientFlow,
} from "./gradient-flow.mjs";
export {
  HAMILTONIAN_STATUS,
  HAMILTONIAN_OPERATOR,
  hamiltonianEnergy,
  hamiltonianForceInto as evaluateHamiltonianForce,
  relaxStep as relaxHamiltonian,
  describeLatticeHamiltonian,
} from "../../substrate/hamiltonian.mjs";
export {
  CONSTRAINT_STATUS,
  CONSTRAINT_MASS,
  CONSTRAINT_CAUSALITY,
  checkMassConservation,
  checkCausality,
  clampPhiConservingMass,
  evaluateConstraints,
} from "./constraint-solver.mjs";
export {
  COLLISION_STATUS,
  inDomain,
  occupancyHit,
  resolveDefectCollision,
  classifyCollision,
  chebyshev,
} from "./collision-manifold.mjs";

import { makeProposal } from "../../proto/aais-gate.mjs";
import { integrateNext, createIntegratorBuffers } from "./temporal-integrator.mjs";
import { DEFAULT_CONSTITUTION } from "../../proto/constitution.mjs";

export function describePhysicsCore() {
  return {
    abiId: PHYSICS_ABI_ID,
    status: PHYSICS_CORE_STATUS,
    organ: "SimulationChamber",
    apis: [
      "TemporalIntegrator.step",
      "GradientFlowSolver.evaluate",
      "LatticeHamiltonian.relax",
      "ConstraintSolver",
      "CollisionManifold",
    ],
    physicsOperator: "lattice-hamiltonian",
    notPoseLerp: true,
    cinematicDefault: "mandala-proto (−∇φ defect walk on actors)",
    cinematicFallback: "pose_interpolation / notGradV via --solver pose",
  };
}

/**
 * Named TemporalIntegrator.step → Proposal (uncommitted).
 */
export function step(certified, constitution = DEFAULT_CONSTITUTION, buffers, extra = {}) {
  const out = buffers || createIntegratorBuffers(certified.shape);
  integrateNext(certified, constitution, out, extra);
  return makeProposal({
    source: "SimulationChamber",
    certified,
    proposed_delta: {
      t: out.t,
      scalar: out.scalar,
      vector: out.vector,
      defect: { ...out.defect },
    },
    causality_bounds: { maxDefectStep: constitution.causality?.maxDefectStep ?? 1 },
    numerical_error_bound: constitution.invariant.numericalErrorBound,
    provenance: {
      organ: "SimulationChamber",
      kernel: "temporal-integrator.v0.2",
      operator: "lattice-hamiltonian",
      collision: out.collision || null,
      t: certified.t,
      tNext: out.t,
    },
  });
}
