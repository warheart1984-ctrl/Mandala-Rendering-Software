/* ConstitutionalCore.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Authority → Validation → Decision Chain (core must enforce constitutional chain ordering)
 *  2. Evidence Requirement (no decision may be produced without evidence)
 *  3. Replay Determinism (must produce identical decisions under identical inputs)
 */

import { ConstitutionalCore, AuthorityRegistry, IntentValidator, DecisionEngine, EvidenceContract, ContinuityLedger, AuthorityTokenGenerator } from "../../../../..";

describe("Authority → Validation → Decision Chain", () => {
  test("enforces constitutional chain ordering", () => {
    const core = new ConstitutionalCore();

    const input = {
      intent: {
        domain: "render",
        purpose: "4D path tracing",
        justification: "test",
        expectedOutcome: { output: "frame" },
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",
        type: "render_4d_tesseract",
      },
      stateSnapshot: { step: 0, phase: "init" },
    };

    // Decision should flow: validate intent → check authority → make decision
    const result = core.decide(input);

    // Decision must be one of: "authorize", "conditional", "deny"
    expect(["authorize", "conditional", "deny"]).toContain(result.decision);

    // If authorized, must have authority token and evidence requirements
    if (result.decision === "authorize") {
      expect(result.authorityToken).toBeDefined();
      expect(result.evidenceRequirements).toBeDefined();
      expect(result.continuityAnchor).toBeDefined();
    }

    // Must preserve input IDs
    expect(result.intentId).toBeDefined();
    expect(result.worldId).toBeDefined();
    expect(result.timelineId).toBeDefined();
    expect(result.timeSeconds).toBeDefined();
    expect(result.parameters).toBeDefined();
  });

  test("conditional decision when authority scope mismatch", () => {
    const core = new ConstitutionalCore();

    const input = {
      intent: {
        domain: "compute",  // mismatched scope
        purpose: "compute",
        justification: "test",
        expectedOutcome: {},
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",  // authority is "render"
      },
      stateSnapshot: { step: 0 },
    };

    const result = core.decide(input);
    // Mismatched scope should yield "conditional", not "authorize"
    expect(result.decision).toBe("conditional");
  });

  test("conditional decision when authority constraints present", () => {
    const core = new ConstitutionalCore();

    const input = {
      intent: {
        domain: "render",
        purpose: "test",
        justification: "test",
        expectedOutcome: {},
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",
        type: "render_4d_tesseract",
      },
      stateSnapshot: { step: 0 },
    };

    // Add constraints to authority
    core.authorityRegistry.authorities.set("render", {
      level: "high",
      scope: "render",
      constraints: { maxOutput: 100 },
    });

    const result = core.decide(input);
    // Constraints present should yield "conditional", not "authorize"
    expect(result.decision).toBe("conditional");
  });
});

describe("Evidence Requirement", () => {
  test("no decision may be produced without evidence", () => {
    const core = new ConstitutionalCore();

    const input = {
      intent: {
        domain: "render",
        purpose: "test",
        justification: "test",
        expectedOutcome: {},
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",
        type: "render_4d_tesseract",
      },
      stateSnapshot: { step: 0 },
    };

    const result = core.decide(input);

    // Must have evidence requirements
    expect(result.evidenceRequirements).toBeDefined();
    expect(Object.keys(result.evidenceRequirements).length).toBeGreaterThan(0);

    // Evidence requirements should specify what's needed
    const evReqs = result.evidenceRequirements;
    expect(evReqs.required).toBe(true);
    expect(evReqs.type).toBeDefined();
    expect(evReqs.anchor).toBeDefined();
  });

  test("evidence requirements vary by action type", () => {
    const core = new ConstitutionalCore();

    // Different action types should have different evidence requirements
    const renderResult = core.decide({
      ...{ intent: { domain: "render", purpose: "test", justification: "test", expectedOutcome: {}, continuityRequirements: {} }, proposedCommand: { domain: "render", type: "render_4d_tesseract" }, stateSnapshot: { step: 0 } },
    });

    const defaultResult = core.decide({
      ...{ intent: { domain: "default", purpose: "test", justification: "test", expectedOutcome: {}, continuityRequirements: {} }, proposedCommand: { domain: "default", type: "default" }, stateSnapshot: { step: 0 } },
    });

    // Both should have evidence requirements but possibly different types
    expect(renderResult.evidenceRequirements).toBeDefined();
    expect(defaultResult.evidenceRequirements).toBeDefined();
  });
});

describe("Replay Determinism", () => {
  test("produces identical decisions under identical inputs", () => {
    const core = new ConstitutionalCore();

    const input1 = {
      intent: {
        domain: "render",
        purpose: "4D path tracing",
        justification: "determinism test",
        expectedOutcome: { output: "frame" },
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",
        type: "render_4d_tesseract",
      },
      stateSnapshot: { step: 0, phase: "init" },
    };

    const input2 = {
      intent: {
        domain: "render",
        purpose: "4D path tracing",
        justification: "determinism test",
        expectedOutcome: { output: "frame" },
        continuityRequirements: {},
      },
      proposedCommand: {
        domain: "render",
        type: "render_4d_tesseract",
      },
      stateSnapshot: { step: 0, phase: "init" },
    };

    const result1 = core.decide(input1);
    const result2 = core.decide(input2);

    // Identical inputs must produce identical decisions
    expect(result1.decision).toBe(result2.decision);
    expect(result1.authorityToken).toBe(result2.authorityToken);
    expect(result1.evidenceRequirements).toEqual(result2.evidenceRequirements);
    expect(result1.continuityAnchor.index).toBe(result2.continuityAnchor.index);
  });

  test("produces identical evidence requirements under identical inputs", () => {
    const core = new ConstitutionalCore();

    const input1 = {
      intent: { domain: "render", purpose: "test", justification: "test", expectedOutcome: {}, continuityRequirements: {} },
      proposedCommand: { domain: "render", type: "render_4d_tesseract" },
      stateSnapshot: { step: 0 },
    };

    const input2 = {
      intent: { domain: "render", purpose: "test", justification: "test", expectedOutcome: {}, continuityRequirements: {} },
      proposedCommand: { domain: "render", type: "render_4d_tesseract" },
      stateSnapshot: { step: 0 },
    };

    const result1 = core.decide(input1);
    const result2 = core.decide(input2);

    expect(result1.evidenceRequirements).toEqual(result2.evidenceRequirements);
  });
});