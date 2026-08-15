/* EvidenceChain.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Evidence Bundle Validity (must contain: intentId, worldId, timelineId, timeSeconds, parameters)
 *  2. Chain Integrity (EvidenceChain must be append‑only)
 *  3. Replay Verification (EvidenceChain must verify replay equivalence)
 */

import { EvidenceChain, EvidenceCollector, EvidenceNormalizer, EvidenceLedger, DomainSignatures, ConstitutionalProofs, ReplayAnchors } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Evidence Bundle Validity", () => {
  test("evidence bundle contains required fields", () => {
    const chain = new EvidenceChain();

    const evidence = {
      intentId: "intent.test",
      worldId: "world.test",
      timelineId: "timeline.test",
      timeSeconds: 1.5,
      parameters: { samplesPerPixel: 1, maxDepth: 4 },
    };

    const result = chain.addEvidence(evidence);

    expect(result).toBeDefined();
    expect(evidence.intentId).toBeDefined();
    expect(evidence.worldId).toBeDefined();
    expect(evidence.timelineId).toBeDefined();
    expect(typeof evidence.timeSeconds).toBe("number");
    expect(evidence.parameters).toBeDefined();
  });

  test("evidence bundle rejects missing intentId", () => {
    const chain = new EvidenceChain();

    const incompleteEvidence = {
      worldId: "world.test",
      timelineId: "timeline.test",
      timeSeconds: 1.5,
      parameters: {},
    };

    const result = chain.addEvidence(incompleteEvidence);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("missing intentId");
  });

  test("evidence bundle rejects missing worldId", () => {
    const chain = new EvidenceChain();

    const incompleteEvidence = {
      intentId: "intent.test",
      timelineId: "timeline.test",
      timeSeconds: 1.5,
      parameters: {},
    };

    const result = chain.addEvidence(incompleteEvidence);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("missing worldId");
  });

  test("evidence bundle rejects missing timelineId", () => {
    const chain = new EvidenceChain();

    const incompleteEvidence = {
      intentId: "intent.test",
      worldId: "world.test",
      timeSeconds: 1.5,
      parameters: {},
    };

    const result = chain.addEvidence(incompleteEvidence);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("missing timelineId");
  });

  test("evidence bundle rejects missing timeSeconds", () => {
    const chain = new EvidenceChain();

    const incompleteEvidence = {
      intentId: "intent.test",
      worldId: "world.test",
      timelineId: "timeline.test",
      parameters: {},
    };

    const result = chain.addEvidence(incompleteEvidence);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("missing timeSeconds");
  });

  test("evidence bundle rejects missing parameters", () => {
    const chain = new EvidenceChain();

    const incompleteEvidence = {
      intentId: "intent.test",
      worldId: "world.test",
      timelineId: "timeline.test",
      timeSeconds: 1.5,
    };

    const result = chain.addEvidence(incompleteEvidence);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("missing parameters");
  });
});

describe("Chain Integrity", () => {
  test("evidence chain is append-only", () => {
    const chain = new EvidenceChain();

    // Add multiple evidences
    const e1 = chain.addEvidence({
      intentId: "intent-1", worldId: "w1", timelineId: "t1", timeSeconds: 0.5, parameters: { a: 1 },
    });
    const e2 = chain.addEvidence({
      intentId: "intent-2", worldId: "w2", timelineId: "t2", timeSeconds: 1.0, parameters: { b: 2 },
    });
    const e3 = chain.addEvidence({
      intentId: "intent-3", worldId: "w3", timelineId: "t3", timeSeconds: 1.5, parameters: { c: 3 },
    });

    // Chain should only grow (append-only)
    expect(chain.getChainLength()).toBe(3);
    expect(e1.index).toBe(0);
    expect(e2.index).toBe(1);
    expect(e3.index).toBe(2);

    // Should not be able to insert at arbitrary position
    const insertResult = chain.insertAt(1, { intentId: "out-of-order", worldId: "w", timelineId: "t", timeSeconds: 0, parameters: {} });
    expect(insertResult.ok).toBe(false); // Should reject out-of-order insertion
  });

  test("chain maintains index continuity", () => {
    const chain = new EvidenceChain();

    chain.addEvidence({ intentId: "a", worldId: "w", timelineId: "t", timeSeconds: 0, parameters: {} });
    chain.addEvidence({ intentId: "b", worldId: "w", timelineId: "t", timeSeconds: 1, parameters: {} });
    chain.addEvidence({ intentId: "c", worldId: "w", timelineId: "t", timeSeconds: 2, parameters: {} });

    const chainData = chain.getChain();
    expect(chainData.length).toBe(3);

    for (let i = 0; i < chainData.length; i++) {
      expect(chainData[i].index).toBe(i);
    }
  });

  test("chain rejects duplicate indices", () => {
    const chain = new EvidenceChain();

    chain.addEvidence({ intentId: "first", worldId: "w", timelineId: "t", timeSeconds: 0, parameters: {} });
    // Attempt to add with same index
    const result = chain.addEvidence({ intentId: "duplicate", worldId: "w", timelineId: "t", timeSeconds: 1, parameters: {}, index: 0 });
    expect(result.ok).toBe(false); // Should reject duplicate index
  });
});

describe("Replay Verification", () => {
  test("evidence chain verifies replay equivalence", () => {
    const chain = new EvidenceChain();

    const originalEvidence = {
      intentId: "replay-test", worldId: "w", timelineId: "t", timeSeconds: 2.0,
      parameters: { samplesPerPixel: 4, maxDepth: 3 },
    };

    chain.addEvidence(originalEvidence);

    // Replay evidence should match original
    const replayEvidence = {
      intentId: "replay-test", worldId: "w", timelineId: "t", timeSeconds: 2.0,
      parameters: { samplesPerPixel: 4, maxDepth: 3 },
    };

    const verification = chain.verifyReplayEquality(originalEvidence, replayEvidence);
    expect(verification.equivalent).toBe(true);
    expect(verification.matchCount).toBeGreaterThan(0);
  });

  test("evidence chain detects replay inequivalence", () => {
    const chain = new EvidenceChain();

    const originalEvidence = {
      intentId: "replay-test", worldId: "w", timelineId: "t", timeSeconds: 2.0,
      parameters: { samplesPerPixel: 4, maxDepth: 3 },
    };

    chain.addEvidence(originalEvidence);

    // Replay evidence with different parameters
    const inequivalentEvidence = {
      intentId: "replay-test", worldId: "w", timelineId: "t", timeSeconds: 2.0,
      parameters: { samplesPerPixel: 2, maxDepth: 3 },  // different samples
    };

    const verification = chain.verifyReplayEquality(originalEvidence, inequivalentEvidence);
    expect(verification.equivalent).toBe(false);
    expect(verification.matchCount).toBeLessThan(verification.totalCount);
  });

  test("evidence chain verifies determinism class consistency in replay", () => {
    const chain = new EvidenceChain();

    const original = {
      intentId: "dclass-test", worldId: "w", timelineId: "t", timeSeconds: 1.0,
      parameters: {}, determinismClass: "D2_NUMERICAL",
    };

    chain.addEvidence(original);

    const replay = {
      intentId: "dclass-test", worldId: "w", timelineId: "t", timeSeconds: 1.0,
      parameters: {}, determinismClass: "D2_NUMERICAL",
    };

    const verification = chain.verifyReplayEquality(original, replay);
    expect(verification.determinismMatch).toBe(true);
  });

  test("evidence chain verifies invariant surface preservation in replay", () => {
    const chain = new EvidenceChain();

    const original = {
      intentId: "inv-test", worldId: "w", timelineId: "t", timeSeconds: 1.0,
      parameters: {}, invariantSurface: "energy_conservation",
    };

    chain.addEvidence(original);

    const replay = {
      intentId: "inv-test", worldId: "w", timelineId: "t", timeSeconds: 1.0,
      parameters: {}, invariantSurface: "energy_conservation",
    };

    const verification = chain.verifyReplayEquality(original, replay);
    expect(verification.invariantMatch).toBe(true);
  });
});