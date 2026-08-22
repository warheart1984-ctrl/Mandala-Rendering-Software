/* ExplanationEngine.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Constitutional Explanation Contract (every decision must produce: cause, evidence, invariant surface, determinism class)
 *  2. Replayable Explanation (explanation must be identical under replay)
 */

import { ExplanationEngine, EventInterpreter, ConstitutionalReasoner, EvidenceReferencer, ContinuityAnalyzer, AnomalyInterpreter, RecommendationGenerator } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Constitutional Explanation Contract", () => {
  test("produces cause for every decision", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation = engine.generateExplanation(decisionInput);

    expect(explanation).toBeDefined();
    expect(explanation.cause).toBeDefined();
    expect(typeof explanation.cause).toBe("string");
  });

  test("produces evidence for every decision", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation = engine.generateExplanation(decisionInput);

    expect(explanation.evidence).toBeDefined();
    expect(["string", "object"]).toContain(typeof explanation.evidence);
  });

  test("produces invariant surface for every decision", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation = engine.generateExplanation(decisionInput);

    expect(explanation.invariantSurface).toBeDefined();
    expect(typeof explanation.invariantSurface).toBe("string");
  });

  test("produces determinism class for every decision", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation = engine.generateExplanation(decisionInput);

    expect(explanation.determinismClass).toBeDefined();
    // Should be one of D0-UNSPECIFIED, D1-EXACT, D2-NUMERICAL, D3-SEMANTIC, D4-STATISTICAL
    const validClasses = [
      "D0", "D1", "D2", "D3", "D4",
    ];
    expect(validClasses).toContain(explanation.determinismClass);
  });

  test("includes all required fields: cause, evidence, invariant surface, determinism class", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation = engine.generateExplanation(decisionInput);

    const requiredFields = ["cause", "evidence", "invariantSurface", "determinismClass"];
    for (const field of requiredFields) {
      expect(explanation).toHaveProperty(field);
    }
  });
});

describe("Replayable Explanation", () => {
  test("produces identical explanation under replay", () => {
    const engine = new ExplanationEngine();

    const decisionInput = {
      decision: "authorize",
      authorityToken: "auth.test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: Date.now() },
    };

    const explanation1 = engine.generateExplanation(decisionInput);
    const explanation2 = engine.generateExplanation(decisionInput);

    // Explanation must be identical under replay
    expect(explanation1.cause).toBe(explanation2.cause);
    expect(explanation1.evidence).toBe(explanation2.evidence);
    expect(explanation1.invariantSurface).toBe(explanation2.invariantSurface);
    expect(explanation1.determinismClass).toBe(explanation2.determinismClass);
  });

  test("produces deterministic explanation with same seed", () => {
    const engine = new ExplanationEngine();

    const input1 = {
      decision: "authorize",
      authorityToken: "auth.seed-test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: 1000 },
    };

    const input2 = {
      decision: "authorize",
      authorityToken: "auth.seed-test",
      evidenceRequirements: { required: true, type: "proof", anchor: "ledger" },
      continuityAnchor: { index: 0, timestamp: 1000 },
    };

    const explanation1 = engine.generateExplanation(input1);
    const explanation2 = engine.generateExplanation(input2);

    // Same input parameters should produce same explanation
    expect(explanation1.determinismClass).toBe(explanation2.determinismClass);
    expect(explanation1.cause).toContain("deterministic");
  });
});