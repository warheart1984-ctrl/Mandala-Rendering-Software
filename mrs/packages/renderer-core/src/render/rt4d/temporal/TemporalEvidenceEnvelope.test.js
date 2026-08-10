// mrs/packages/renderer-core/src/render/rt4d/temporal/TemporalEvidenceEnvelope.test.js
// Status: **passing with gaps** - TemporalEvidenceEnvelope creation + validation tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTemporalEvidenceEnvelope,
  validateTemporalEvidenceEnvelope,
  computeReplayToken,
} from "./TemporalEvidenceEnvelope.js";

describe("TemporalEvidenceEnvelope", () => {
  it("createTemporalEvidenceEnvelope builds envelope with required fields", () => {
    const partial = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
    };
    const envelope = createTemporalEvidenceEnvelope(partial);
    assert.equal(envelope.operationId, "op-1");
    assert.equal(envelope.operationType, "fork");
    assert.equal(envelope.sourceTimelineId, "tl-1");
    assert.equal(envelope.resultTimelineId, "tl-2");
    assert.deepEqual(envelope.metric, { type: "euclidean" });
    assert.equal(envelope.parentStateHash, "hash-1");
    assert.equal(envelope.resultStateHash, "hash-2");
    assert.ok(envelope.replayToken);
    assert.equal(typeof envelope.replayToken, "string");
    assert.equal(envelope.replayToken.length, 64); // sha256 hex
  });

  it("createTemporalEvidenceEnvelope uses provided replayToken", () => {
    const partial = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "custom-token-123",
    };
    const envelope = createTemporalEvidenceEnvelope(partial);
    assert.equal(envelope.replayToken, "custom-token-123");
  });

  it("computeReplayToken is deterministic", () => {
    const material = { a: 1, b: 2 };
    const t1 = computeReplayToken(material);
    const t2 = computeReplayToken(material);
    assert.equal(t1, t2);
    assert.equal(t1.length, 64); // sha256 hex
  });

  it("computeReplayToken is order-sensitive (sorted keys)", () => {
    const t1 = computeReplayToken({ a: 1, b: 2 });
    const t2 = computeReplayToken({ b: 2, a: 1 });
    assert.equal(t1, t2);
  });

  it("validateTemporalEvidenceEnvelope passes for valid envelope", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token-123",
      evidenceStatus: "draft",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("validateTemporalEvidenceEnvelope rejects missing required fields", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("sourceTimelineId")));
    assert.ok(result.errors.some((e) => e.includes("resultTimelineId")));
    assert.ok(result.errors.some((e) => e.includes("metric")));
    assert.ok(result.errors.some((e) => e.includes("parentStateHash")));
    assert.ok(result.errors.some((e) => e.includes("resultStateHash")));
    assert.ok(result.errors.some((e) => e.includes("replayToken")));
    assert.ok(result.errors.some((e) => e.includes("evidenceStatus")));
  });

  it("validateTemporalEvidenceEnvelope rejects invalid operationType", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "invalid_type",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "draft",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("invalid operationType")));
  });

  it("validateTemporalEvidenceEnvelope validates evidenceStatus", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "invalid_status",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("invalid evidenceStatus")));
  });

  it("validateTemporalEvidenceEnvelope validates evolutionLaw structure", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "draft",
      evolutionLaw: { lawId: "test", lawHash: "hash" },
      initialStateHash: "init-hash",
      finalStateHash: "final-hash",
      trajectoryRoot: "root-hash",
      stepCount: 10,
    };
    let result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, true);

    envelope.evolutionLaw = { lawId: "test" }; // missing lawHash
    let result2 = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result2.ok, false);
    assert.ok(result2.errors.some((e) => e.includes("evolutionLaw.lawHash required")));

    envelope.evolutionLaw = { lawHash: "hash" }; // missing lawId
    let result3 = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result3.ok, false);
    assert.ok(result3.errors.some((e) => e.includes("evolutionLaw.lawId required")));

    envelope.evolutionLaw = { lawId: "test", lawHash: "hash", classification: "physical" }; // invalid classification
    let result4 = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result4.ok, false);
    assert.ok(result4.errors.some((e) => e.includes("classification must be toy_model")));

    envelope.evolutionLaw = "not an object";
    let result5 = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result5.ok, false);
    assert.ok(result5.errors.some((e) => e.includes("evolutionLaw must be an object")));
  });

  it("validateTemporalEvidenceEnvelope requires initialStateHash/finalStateHash/trajectoryRoot/stepCount when evolutionLaw present", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "draft",
      evolutionLaw: { lawId: "test", lawHash: "hash" },
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("initialStateHash required")));
    assert.ok(result.errors.some((e) => e.includes("finalStateHash required")));
    assert.ok(result.errors.some((e) => e.includes("trajectoryRoot required")));
    assert.ok(result.errors.some((e) => e.includes("stepCount required")));
  });

  it("validateTemporalEvidenceEnvelope validates replayStatus", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: { type: "euclidean" },
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "draft",
      replayStatus: "invalid",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("invalid replayStatus")));
  });

  it("validateTemporalEvidenceEnvelope accepts valid replayStatus values", () => {
    for (const status of ["verified", "failed", "declared"]) {
      const envelope = {
        operationId: "op-1",
        operationType: "fork",
        sourceTimelineId: "tl-1",
        resultTimelineId: "tl-2",
        metric: { type: "euclidean" },
        parentStateHash: "hash-1",
        resultStateHash: "hash-2",
        replayToken: "token",
        evidenceStatus: "draft",
        replayStatus: status,
      };
      const result = validateTemporalEvidenceEnvelope(envelope);
      assert.equal(result.ok, true, `should accept ${status}`);
    }
  });

  it("validateTemporalEvidenceEnvelope requires metric to be object", () => {
    const envelope = {
      operationId: "op-1",
      operationType: "fork",
      sourceTimelineId: "tl-1",
      resultTimelineId: "tl-2",
      metric: "not an object",
      parentStateHash: "hash-1",
      resultStateHash: "hash-2",
      replayToken: "token",
      evidenceStatus: "draft",
    };
    const result = validateTemporalEvidenceEnvelope(envelope);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("metric must be an object")));
  });

  it("validateTemporalEvidenceEnvelope accepts evidenceStatus values", () => {
    for (const status of ["draft", "substrate_verified", "declared"]) {
      const envelope = {
        operationId: "op-1",
        operationType: "fork",
        sourceTimelineId: "tl-1",
        resultTimelineId: "tl-2",
        metric: { type: "euclidean" },
        parentStateHash: "hash-1",
        resultStateHash: "hash-2",
        replayToken: "token",
        evidenceStatus: status,
      };
      const result = validateTemporalEvidenceEnvelope(envelope);
      assert.equal(result.ok, true, `should accept ${status}`);
    }
  });
});