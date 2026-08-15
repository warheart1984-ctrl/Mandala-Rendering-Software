/* AnomalyRules.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Detection of Drift Events (numerical drift, semantic drift, statistical drift)
 *  2. Classification (map drift to determinism classes: D2_NUMERICAL, D3_SEMANTIC, D4_STATISTICAL)
 *  3. Constitutional Escalation (drift above threshold must escalate to EvidenceChain)
 */

import { AnomalyRules, TemporalBreakDetector, TemporalLoopDetector, GeometricDistortionDetector, DomainViolationDetector, ConstitutionalViolationDetector, EvidenceContradictionDetector } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Detection of Drift Events", () => {
  test("detects numerical drift", () => {
    const rules = new AnomalyRules();

    // Simulate numerical drift: output values deviating beyond tolerance
    const numericalData = {
      maxAbsoluteError: 0.05,     // exceeds 1e-4 tolerance
      maxRelativeError: 0.02,     // exceeds 1e-3 tolerance
      rmse: 0.03,
    };

    const driftResult = rules.detectNumericalDrift(numericalData);
    expect(driftResult.driftDetected).toBe(true);
    expect(driftResult.determinismClass).toBe("D2_NUMERICAL");
  });

  test("detects semantic drift", () => {
    const rules = new AnomalyRules();

    // Simulate semantic drift: invariant violations
    const semanticData = {
      meanDifference: 0.08,       // exceeds 0.01 threshold
      maxError: 0.12,             // exceeds 0.05 threshold
      hashMatch: false,           // output hash mismatch
      semanticInvariants: [
        { name: "energy_conservation", passed: false },
        { name: "geometry_valid", passed: true },
      ],
    };

    const driftResult = rules.detectSemanticDrift(semanticData);
    expect(driftResult.driftDetected).toBe(true);
    expect(driftResult.determinismClass).toBe("D3_SEMANTIC");
  });

  test("detects statistical drift", () => {
    const rules = new AnomalyRules();

    // Simulate statistical drift: variance across samples too high
    const statisticalData = {
      varianceAcrossSamples: 0.05,     // exceeds 0.01 variance limit
      sampleCount: 10,
      hashMatchAcrossSamples: false,   // hashes differ between samples
      confidence: 0.95,
    };

    const driftResult = rules.detectStatisticalDrift(statisticalData);
    expect(driftResult.driftDetected).toBe(true);
    expect(driftResult.determinismClass).toBe("D4_STATISTICAL");
  });

  test("detects no drift when all within limits", () => {
    const rules = new AnomalyRules();

    const cleanData = {
      maxAbsoluteError: 1e-5,          // within 1e-4 tolerance
      maxRelativeError: 1e-4,          // within 1e-3 tolerance
      meanDifference: 0.005,           // within 0.01 threshold
      hashMatch: true,
      varianceAcrossSamples: 0.001,    // within variance limit
    };

    const driftResult = rules.detectAllDrifts(cleanData);
    expect(driftResult.numericalDrift).toBe(false);
    expect(driftResult.semanticDrift).toBe(false);
    expect(driftResult.statisticalDrift).toBe(false);
    expect(driftResult.overallDrift).toBe(false);
  });
});

describe("Classification", () => {
  test("maps numerical drift to D2_NUMERICAL", () => {
    const rules = new AnomalyRules();

    const data = { maxAbsoluteError: 0.05, maxRelativeError: 0.02, rmse: 0.03 };
    const cls = rules.classifyNumerical(data);
    expect(cls).toBe(DeterminismClass.D2_NUMERICAL);
  });

  test("maps semantic drift to D3_SEMANTIC", () => {
    const rules = new AnomalyRules();

    const data = { meanDifference: 0.08, maxError: 0.12, hashMatch: false };
    const cls = rules.classifySemantic(data);
    expect(cls).toBe(DeterminismClass.D3_SEMANTIC);
  });

  test("maps statistical drift to D4_STATISTICAL", () => {
    const rules = new AnomalyRules();

    const data = { varianceAcrossSamples: 0.05, sampleCount: 10, hashMatchAcrossSamples: false };
    const cls = rules.classifyStatistical(data);
    expect(cls).toBe(DeterminismClass.D4_STATISTICAL);
  });
});

describe("Constitutional Escalation", () => {
  test("escalates numerical drift to EvidenceChain", () => {
    const rules = new AnomalyRules();
    const evidenceChain = new (require("../../../../../evidence/EvidenceChain.js").default)();

    const numericalData = { maxAbsoluteError: 0.05, maxRelativeError: 0.02 };
    const escalation = rules.escalateToEvidenceChain(numericalData, evidenceChain);

    expect(escalation.escalated).toBe(true);
    expect(evidenceChain.chain.length).toBeGreaterThan(0);
  });

  test("escalates semantic drift to EvidenceChain", () => {
    const rules = new AnomalyRules();
    const evidenceChain = new (require("../../../../../evidence/EvidenceChain.js").default)();

    const semanticData = { meanDifference: 0.08, maxError: 0.12, hashMatch: false };
    const escalation = rules.escalateToEvidenceChain(semanticData, evidenceChain);

    expect(escalation.escalated).toBe(true);
    expect(evidenceChain.chain.length).toBeGreaterThan(0);
  });

  test("escalates statistical drift to EvidenceChain", () => {
    const rules = new AnomalyRules();
    const evidenceChain = new (require("../../../../../evidence/EvidenceChain.js").default)();

    const statisticalData = { varianceAcrossSamples: 0.05, sampleCount: 10 };
    const escalation = rules.escalateToEvidenceChain(statisticalData, evidenceChain);

    expect(escalation.escalated).toBe(true);
    expect(evidenceChain.chain.length).toBeGreaterThan(0);
  });

  test("does not escalate when drift is within thresholds", () => {
    const rules = new AnomalyRules();
    const evidenceChain = new (require("../../../../../evidence/EvidenceChain.js").default)();

    const cleanData = { maxAbsoluteError: 1e-5, maxRelativeError: 1e-4 };
    const escalation = rules.escalateToEvidenceChain(cleanData, evidenceChain);

    expect(escalation.escalated).toBe(false);
    expect(evidenceChain.chain.length).toBe(0);
  });
});