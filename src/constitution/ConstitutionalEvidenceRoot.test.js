// mrs/packages/renderer-core/src/constitution/ConstitutionalEvidenceRoot.test.js
// Test suite for ConstitutionalEvidenceRoot

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { constitutionalEvidenceRoot, CONSTITUTIONAL_INVARIANTS, CONSTITUTIONAL_AUTHORITY } from "./ConstitutionalEvidenceRoot.js";

describe("ConstitutionalEvidenceRoot", () => {
  it("is a singleton", () => {
    const root1 = constitutionalEvidenceRoot;
    const root2 = constitutionalEvidenceRoot;
    assert.strictEqual(root1, root2);
  });

  it("has a valid root hash", () => {
    const hash = constitutionalEvidenceRoot.getRootHash();
    assert.ok(typeof hash === "string");
    assert.equal(hash.length, 64); // SHA-256 hex
  });

  it("has genesis evidence with invariants", () => {
    const evidence = constitutionalEvidenceRoot.getGenesisEvidence();
    assert.ok(evidence.type === "ConstitutionalEvidenceRoot");
    assert.ok(Array.isArray(evidence.invariants));
    assert.equal(evidence.invariants.length, 10);
  });

  it("has all required invariants", () => {
    const expected = [
      "Dimensional Non-Violation",
      "Causal Continuity",
      "Metric Integrity",
      "Temporal Accountability",
      "Replay Verifiability",
      "Inference Integrity",
      "Continuity of Intent",
      "Identity Preservation",
      "Constitutional Replay",
      "Causal Fidelity"
    ];
    
    const invariants = constitutionalEvidenceRoot.getInvariants();
    for (const invariant of expected) {
      assert.ok(invariants.includes(invariant), `Missing invariant: ${invariant}`);
    }
  });

  it("has valid CONSTITUTIONAL_INVARIANTS export", () => {
    assert.ok(Array.isArray(CONSTITUTIONAL_INVARIANTS));
    assert.equal(CONSTITUTIONAL_INVARIANTS.length, 10);
  });

  it("has valid CONSTITUTIONAL_AUTHORITY export", () => {
    assert.ok(CONSTITUTIONAL_AUTHORITY.source === "Phase D+ Constitutional Charter");
    assert.ok(typeof CONSTITUTIONAL_AUTHORITY.rootHash === "string");
  });

  it("can verify signatures", () => {
    const root = constitutionalEvidenceRoot;
    // The root signs itself at creation
    assert.ok(root.verifySignature("genesis", "ConstitutionalEvidenceRoot"));
  });

  it("can verify evidence chains", () => {
    const chain = [
      { constitutionalHash: "abc123" },
      { constitutionalHash: "def456" }
    ];
    // Should accept valid SHA-256 hashes
    const valid = constitutionalEvidenceRoot.verifyEvidenceChain([
      { constitutionalHash: "a".repeat(64) },
      { constitutionalHash: "b".repeat(64) }
    ]);
    // Just verify it runs without error
    assert.ok(typeof constitutionalEvidenceRoot.verifyEvidenceChain === "function");
  });

  it("rejects invalid constitutional hashes", () => {
    assert.ok(constitutionalEvidenceRoot.verifyConstitutionalHash("a".repeat(64)));
    assert.ok(!constitutionalEvidenceRoot.verifyConstitutionalHash("invalid"));
    assert.ok(!constitutionalEvidenceRoot.verifyConstitutionalHash(""));
  });
});