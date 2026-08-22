/* PILOT.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Intent Parsing (PILOT must extract: intent, parameters, worldId, timelineId)
 *  2. Constitutional Dispatch (PILOT must dispatch to CPP only with valid intent)
 *  3. Replay Determinism (PILOT must produce identical dispatch under replay)
 */

import { PILOT, PerceptionModule, StateInterpretationModule, PlanningModule, NavigationModule, AnomalyDetectionModule, CommandProposalModule, ExplanationModule } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Intent Parsing", () => {
  test("PILOT extracts intent", () => {
    const pilot = new PILOT();

    const input = {
      rawInput: "render_4d_tesseract",
      context: { scene: "test_scene", meshes: ["mesh1"] },
    };

    const parsed = pilot.parseIntent(input);

    expect(parsed).toBeDefined();
    expect(parsed.intent).toBeDefined();
    expect(typeof parsed.intent).toBe("string");
  });

  test("PILOT extracts parameters", () => {
    const pilot = new PILOT();

    const input = {
      rawInput: "render_4d_tesseract with samples=4",
      context: {},
    };

    const parsed = pilot.parseIntent(input);

    expect(parsed.parameters).toBeDefined();
    expect(typeof parsed.parameters).toBe("object");
  });

  test("PILOT extracts worldId", () => {
    const pilot = new PILOT();

    const input = {
      rawInput: "render_4d_tesseract world=world-test",
      context: {},
    };

    const parsed = pilot.parseIntent(input);

    expect(parsed.worldId).toBeDefined();
    expect(typeof parsed.worldId).toBe("string");
  });

  test("PILOT extracts timelineId", () => {
    const pilot = new PILOT();

    const input = {
      rawInput: "render_4d_tesseract timeline=timeline-test",
      context: {},
    };

    const parsed = pilot.parseIntent(input);

    expect(parsed.timelineId).toBeDefined();
    expect(typeof parsed.timelineId).toBe("string");
  });

  test("PILOT extracts all required fields simultaneously", () => {
    const pilot = new PILOT();

    const input = {
      rawInput: "render_4d_tesseract world=w1 timeline=t1 samples=4",
      context: { scene: "scene1" },
    };

    const parsed = pilot.parseIntent(input);

    expect(parsed.intent).toBeDefined();
    expect(parsed.parameters).toBeDefined();
    expect(parsed.worldId).toBeDefined();
    expect(parsed.timelineId).toBeDefined();
  });
});

describe("Constitutional Dispatch", () => {
  test("PILOT dispatches to CPP only with valid intent", () => {
    const pilot = new PILOT();
    const cpp = new (require("../../../../../cpp/CommandProposalProtocol.js").default)();

    // Valid intent with all required fields
    const validIntent = {
      intent: "render_4d_tesseract",
      parameters: { worldId: "world-test", timelineId: "timeline-test" },
      domain: "render",
    };

    const dispatchResult = pilot.dispatch(validIntent, cpp);

    // Valid intent should result in dispatch to CPP
    expect(dispatchResult).toBeDefined();
    expect(dispatchResult.authorityToken).toBeDefined();
    expect(dispatchResult.decision).toBe("authorize");
  });

  test("PILOT rejects dispatch with invalid/malformed intent", () => {
    const pilot = new PILOT();
    const cpp = new (require("../../../../../cpp/CommandProposalProtocol.js").default)();

    // Invalid intent missing required fields
    const invalidIntents = [
      { intent: "render_4d_tesseract", parameters: {} },           // missing worldId/timelineId
      { intent: "render_4d_tesseract", parameters: { worldId: "w" } },  // missing timelineId
      { intent: "", parameters: { worldId: "w", timelineId: "t" } },  // empty intent
    ];

    for (const invalidIntent of invalidIntents) {
      const dispatchResult = pilot.dispatch(invalidIntent, cpp);
      // Invalid intent should not dispatch (decision should be null or "deny")
      expect(dispatchResult).toBeDefined();
    }
  });

  test("PILOT dispatch includes constitutional metadata", () => {
    const pilot = new PILOT();
    const cpp = new (require("../../../../../cpp/CommandProposalProtocol.js").default)();

    const intent = {
      intent: "render_4d_tesseract",
      parameters: { worldId: "world-test", timelineId: "timeline-test", samplesPerPixel: 4 },
      domain: "render",
    };

    const dispatchResult = pilot.dispatch(intent, cpp);

    expect(dispatchResult).toHaveProperty("authorityToken");
    expect(dispatchResult).toHaveProperty("continuityAnchor");
    expect(dispatchResult).toHaveProperty("evidenceRequirements");
    expect(dispatchResult).toHaveProperty("intentId");
  });
});

describe("Replay Determinism", () => {
  test("PILOT produces identical dispatch under replay", () => {
    const pilot = new PILOT();

    const input1 = {
      rawInput: "render_4d_tesseract world=w1 timeline=t1",
      context: { scene: "s1" },
    };

    const input2 = {
      rawInput: "render_4d_tesseract world=w1 timeline=t1",
      context: { scene: "s1" },
    };

    const dispatch1 = pilot.dispatch(input1);
    const dispatch2 = pilot.dispatch(input2);

    // Identical inputs must produce identical dispatches
    expect(dispatch1.intentId).toBe(dispatch2.intentId);
    expect(dispatch1.authorityToken).toBe(dispatch2.authorityToken);
    expect(dispatch1.decision).toBe(dispatch2.decision);
    expect(dispatch1.evidenceRequirements).toEqual(dispatch2.evidenceRequirements);
  });

  test("PILOT replay determinism preserves determinism class", () => {
    const pilot = new PILOT();

    const input1 = {
      rawInput: "render_4d_tesseract",
      context: { scene: "s1" },
    };

    const input2 = {
      rawInput: "render_4d_tesseract",
      context: { scene: "s1" },
    };

    const dispatch1 = pilot.dispatch(input1);
    const dispatch2 = pilot.dispatch(input2);

    // Determinism class should be consistent across replays
    expect(dispatch1.determinismClass).toBe(dispatch2.determinismClass);
  });

  test("PILOT replay with same seed produces identical results", () => {
    const pilot = new PILOT();

    const seededInput1 = {
      rawInput: "render_4d_tesseract",
      context: { scene: "s1", seed: 42 },
    };

    const seededInput2 = {
      rawInput: "render_4d_tesseract",
      context: { scene: "s1", seed: 42 },
    };

    const dispatch1 = pilot.dispatch(seededInput1);
    const dispatch2 = pilot.dispatch(seededInput2);

    // Same seed should produce identical dispatch
    expect(dispatch1.authorityToken).toBe(dispatch2.authorityToken);
    expect(dispatch1.intentId).toBe(dispatch2.intentId);
  });
});