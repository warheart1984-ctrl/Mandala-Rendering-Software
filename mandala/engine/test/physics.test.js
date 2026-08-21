import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONSTITUTION } from "../../proto/constitution.mjs";
import { createInitialCertifiedState, scalarMass } from "../../proto/certified-state.mjs";
import {
  step,
  evaluateGradientFlow,
  checkMassConservation,
  checkCausality,
  clampPhiConservingMass,
  resolveDefectCollision,
  classifyCollision,
  PHYSICS_CORE_STATUS,
  INTEGRATOR_DRIVER,
} from "../physics/index.mjs";
import {
  commitEngineProposal,
  proposeIllegalCollision,
  proposeIllegalSuperluminal,
} from "../aais/index.mjs";

describe("physics core v0.2", () => {
  it("integrator is not pose-lerp and conserves scalar mass", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const mass0 = scalarMass(state.scalar);
    const proposal = step(state);
    const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(r.committed, true);
    assert.equal(state.t, 1);
    assert.equal(INTEGRATOR_DRIVER, "cpu_reference_transport");
    assert.notEqual(INTEGRATOR_DRIVER, "pose_interpolation");
    assert.equal(PHYSICS_CORE_STATUS, "partial");
    const mass = checkMassConservation(state.scalar, state.scalar, DEFAULT_CONSTITUTION.invariant.numericalErrorBound);
    assert.ok(Math.abs(scalarMass(state.scalar) - mass0) <= DEFAULT_CONSTITUTION.invariant.numericalErrorBound);
    assert.equal(mass.ok, true);
  });

  it("gradient-flow evaluate fills ∇φ deterministically", () => {
    const state = createInitialCertifiedState({ seed: 5 });
    const a = new Float32Array(state.vector.length);
    const b = new Float32Array(state.vector.length);
    evaluateGradientFlow(state.scalar, a, state.shape);
    evaluateGradientFlow(state.scalar, b, state.shape);
    let nonzero = 0;
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i], b[i]);
      if (a[i] !== 0) nonzero++;
    }
    assert.ok(nonzero > 0);
  });

  it("rejects superluminal defect teleport", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const hash = state.hash;
    const proposal = proposeIllegalSuperluminal(state, DEFAULT_CONSTITUTION);
    const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(r.committed, false);
    assert.ok(r.decision.reasons.some((x) => x.code === "mandala.engine.no-superluminal-defect"));
    assert.equal(state.hash, hash);
    const c = checkCausality(state.defect, proposal.proposed_delta.defect, 1);
    assert.equal(c.ok, false);
  });

  it("rejects unresolved domain collision; bounce stays in-domain", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const hash = state.hash;
    const proposal = proposeIllegalCollision(state, DEFAULT_CONSTITUTION);
    const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(r.committed, false);
    assert.ok(r.decision.reasons.some((x) => String(x.code).includes("collision")));
    assert.equal(state.hash, hash);

    const bounced = resolveDefectCollision(
      { type: "local_rupture", x: 0, y: 0, z: 0 },
      { type: "local_rupture", x: -2, y: 0, z: 0 },
      state.shape,
    );
    assert.equal(bounced.defect.x, 0);
    assert.ok(bounced.bounced.includes("x-min"));
    const occ = resolveDefectCollision(
      { type: "local_rupture", x: 4, y: 4, z: 4 },
      { type: "local_rupture", x: 5, y: 4, z: 4 },
      state.shape,
      [{ x: 5, y: 4, z: 4 }],
    );
    assert.equal(occ.defect.x, 4);
    assert.ok(occ.bounced.includes("occupancy"));
    const illegal = classifyCollision(
      { x: 1, y: 1, z: 1 },
      { x: -3, y: 1, z: 1 },
      state.shape,
    );
    assert.equal(illegal.legal, false);
  });

  it("phi clamp conserves mass", () => {
    const scalar = new Float32Array([10, -12, 1, 2]);
    const mass0 = scalarMass(scalar);
    const r = clampPhiConservingMass(scalar, -8, 8);
    assert.ok(Math.abs(scalarMass(r.scalar) - mass0) < 1e-5);
  });
});
