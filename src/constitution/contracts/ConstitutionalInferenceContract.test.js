/**
 * Test suite for ConstitutionalInferenceContract
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { constitutionalInferenceContract, REASONING_STATUS, EVIDENCE_STRENGTH, INFERENCE_TYPES } from "./ConstitutionalInferenceContract.js";

describe("ConstitutionalInferenceContract", () => {
  it("creates an inference", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "All photons have energy",
      premiseIds: ["premise-1", "premise-2"],
      evidenceIds: ["evidence-1"],
      reasoningChain: [
        { step: 1, premise: "Photons are particles", inference: "Particles have energy", justification: "E=mc^2" }
      ],
      confidence: 0.9,
      evidenceStrength: "strong"
    });
    
    assert.ok(record.id);
    assert.equal(record.type, "deductive");
    assert.equal(record.conclusion, "All photons have energy");
    assert.equal(record.status, "pending");
  });

  it("validates an inference with sufficient evidence", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test",
      evidenceIds: ["ev-1", "ev-2"],
      confidence: 0.9,
      evidenceStrength: "strong"
    });
    
    const result = constitutionalInferenceContract.validateInference(record.id);
    assert.equal(result.valid, true);
  });

  it("rejects inference with insufficient evidence", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test",
      evidenceIds: [],
      confidence: 0.5,
      evidenceStrength: "insufficient"
    });
    
    const result = constitutionalInferenceContract.validateInference(record.id);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("insufficient")));
  });

  it("can bind and clear observation projection", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test"
    });
    
    const bundle = { status: "partial", state: {}, kernel: {}, aperture: {} };
    constitutionalInferenceContract.bindObservationProjection(bundle);
    
    const result = constitutionalInferenceContract.projectObservationPoint({ x: 0, y: 0, z: 0, w: 0 });
    assert.ok(result);
    assert.equal(result.authority, "observation");
    assert.equal(result.printSoT, false);
    
    constitutionalInferenceContract.bindObservationProjection(null);
    const result2 = constitutionalInferenceContract.projectObservationPoint({ x: 0, y: 0, z: 0, w: 0 });
    assert.equal(result2, null);
  });

  it("can revise an inference", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "original conclusion",
      premiseIds: ["p1"],
      evidenceIds: ["e1"],
      reasoningChain: [{ step: 1, premise: "A", inference: "B" }]
    });
    
    const revised = constitutionalInferenceContract.reviseInference(record.id, {
      updates: { conclusion: "revised conclusion" },
      reasoning: "Updated based on new evidence",
      additionalEvidenceIds: ["e2"],
      reason: "New evidence found"
    });
    
    assert.equal(revised.record.status, "revised");
    assert.equal(revised.record.conclusion, "revised conclusion");
    assert.equal(revised.record.revisedFrom, record.id);
    assert.ok(revised.record.reasoningChain.length >= 2);
  });

  it("verifies replay token", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test",
      evidenceIds: ["e1"],
      confidence: 0.9
    });
    
    const verification = constitutionalInferenceContract.verifyReplayToken(record.id);
    assert.equal(verification.valid, true);
    assert.ok(verification.token);
  });

  it("checks blind spots", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test",
      evidenceIds: [],
      confidence: 0.3,
      evidenceStrength: "insufficient"
    });
    
    const report = constitutionalInferenceContract.checkBlindSpots(record.id);
    assert.equal(report.hasBlindSpots, true);
    assert.ok(report.blindSpots.length > 0);
  });

  it("verifies replay token", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "test",
      evidenceIds: ["e1"]
    });
    
    const verification = constitutionalInferenceContract.verifyReplayToken(record.id);
    assert.equal(verification.valid, true);
    assert.ok(verification.token);
  });

  it("supports different inference types", () => {
    const types = ["deductive", "inductive", "abductive", "analogical", "causal", "temporal", "dimensional", "counterfactual"];
    
    for (const type of types) {
      const record = constitutionalInferenceContract.createInference({
        type,
        conclusion: `test for ${type}`,
        evidenceIds: ["e1"]
      });
      assert.equal(record.type, type);
    }
  });

  it("creates reasoning chains", () => {
    const record1 = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "A",
      evidenceIds: ["e1"]
    });
    
    const record2 = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "B",
      premiseIds: [record1.id],
      evidenceIds: ["e2"],
      reasoningChain: [{ step: 1, premise: "A", inference: "B" }]
    });
    
    const record3 = constitutionalInferenceContract.createInference({
      type: "deductive",
      conclusion: "C",
      premiseIds: [record2.id],
      evidenceIds: ["e3"],
      reasoningChain: [
        { step: 1, premise: "A", inference: "B" },
        { step: 2, premise: "B", inference: "C" }
      ]
    });
    
    const chain = constitutionalInferenceContract.getReasoningChain(record3.id);
    assert.ok(chain.length >= 2);
  });

  it("checks blind spots", () => {
    const record = constitutionalInferenceContract.createInference({
      type: "causal",
      conclusion: "A causes B",
      evidenceIds: [],
      evidenceStrength: "insufficient"
    });
    
    const report = constitutionalInferenceContract.checkBlindSpots(record.id);
    assert.ok(report.hasBlindSpots);
    assert.ok(report.blindSpots.includes("No supporting evidence"));
  });
});