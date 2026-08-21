import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONSTITUTION } from "../../proto/constitution.mjs";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";
import {
  ORGAN_ABI_V1,
  loadSchemas,
  validate,
  commitEngineProposal,
  proposeIllegalOrganPhysics,
  makeEngineProposal,
} from "../aais/index.mjs";

describe("AAIS organ ABI v1", () => {
  it("descriptor matches frozen schema (not AAIS-UL v20)", () => {
    const schemas = loadSchemas();
    const errors = validate(schemas.organAbi, ORGAN_ABI_V1);
    assert.deepEqual(errors, []);
    assert.equal(ORGAN_ABI_V1.abiId, "mandala-engine-organ.v1");
    assert.equal(ORGAN_ABI_V1.aaisUlV20, "not-in-repo");
    assert.equal(ORGAN_ABI_V1.physicsProposer, "SimulationChamber");
    assert.equal(ORGAN_ABI_V1.status, "working");
  });

  it("rejects physics proposals from Mandala/Painter/Mythar/MovieLane", () => {
    const state = createInitialCertifiedState({ seed: 2 });
    const hash = state.hash;
    for (const source of ["Mandala", "AIPainter", "Mythar", "MovieLane"]) {
      const proposal = proposeIllegalOrganPhysics(state, DEFAULT_CONSTITUTION, source);
      const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION);
      assert.equal(r.committed, false, source);
      assert.ok(
        r.decision.reasons.some((x) => x.code === "organ-cannot-mutate-physics"),
        source,
      );
      assert.equal(state.hash, hash, source);
    }
  });

  it("appearance proposal does not mutate certified hash", () => {
    const state = createInitialCertifiedState({ seed: 2 });
    const hash = state.hash;
    const proposal = makeEngineProposal({
      source: "AIPainter",
      kind: "appearance",
      certified: state,
      proposed_delta: {
        t: state.t,
        scalar: state.scalar,
        vector: state.vector,
        defect: { ...state.defect },
      },
      provenance: { organ: "AIPainter" },
    });
    const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(r.committed, false);
    assert.equal(r.decision.accepted, true);
    assert.equal(state.hash, hash);
  });

  it("receipt schema accepts a minimal receipt", () => {
    const schemas = loadSchemas();
    const receipt = {
      type: "mandala-engine-receipt",
      abiId: "mandala-engine-organ.v1",
      abiVersion: "1.0.0",
      status: "partial",
      stateHash: "a".repeat(32),
      constitutionId: DEFAULT_CONSTITUTION.id,
      seed: 7,
      organs: { AAIS: "working" },
      artifacts: [{ kind: "png", path: "/tmp/x.png" }],
      movieLaneOwnsTime: false,
      rendererMutatedCertified: false,
    };
    assert.deepEqual(validate(schemas.receipt, receipt), []);
  });
});
