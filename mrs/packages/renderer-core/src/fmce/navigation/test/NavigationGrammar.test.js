/* NavigationGrammar.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Grammar Validity (navigation commands must obey constitutional grammar)
 *  2. Illegal Command Rejection (commands violating invariants must be rejected)
 *  3. Replayable Navigation (navigation must be deterministic under replay)
 */

import { NavigationGrammar, GeometricPrimitives, ConstitutionalZones, DomainBoundaries, TemporalPaths, RiskGradients, NavigationRules } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Grammar Validity", () => {
  test("navigation commands obey constitutional grammar", () => {
    const grammar = new NavigationGrammar();

    const validCommands = [
      { command: "move_forward", params: { distance: 1.0 } },
      { command: "move_backward", params: { distance: 1.0 } },
      { command: "rotate", params: { angle: 0.5 } },
      { command: "translate", params: { x: 1.0, y: 0.0 } },
    ];

    for (const cmd of validCommands) {
      const result = grammar.parse(cmd.command, cmd.params);
      expect(result.valid).toBe(true);
      expect(result.grammar).toBeDefined();
    }
  });

  test("invalid navigation commands are rejected by grammar", () => {
    const grammar = new NavigationGrammar();

    const invalidCommands = [
      { command: "jump", params: { height: -1.0 } },        // negative height violates invariant
      { command: "teleport", params: { x: 1e10 } },         // violates spatial constraints
      { command: "rotate", params: { angle: 3600 } },       // excessive angle
      { command: "scale", params: { factor: 0.001 } },      // too small violates scale invariant
    ];

    for (const cmd of invalidCommands) {
      const result = grammar.parse(cmd.command, cmd.params);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errorCount).toBeGreaterThan(0);
    }
  });

  test("constitutional zones constrain navigation", () => {
    const grammar = new NavigationGrammar();

    const zoneConstrainedCommands = [
      { command: "enter_safe_zone", params: { zoneId: "safe-1" } },
      { command: "exit_zone", params: { zoneId: "safe-1" } },
    ];

    for (const cmd of zoneConstrainedCommands) {
      const result = grammar.parseWithZones(cmd.command, cmd.params);
      expect(result.zoneValid).toBe(true);
    }
  });
});

describe("Illegal Command Rejection", () => {
  test("rejects commands violating numerical invariants", () => {
    const grammar = new NavigationGrammar();

    const numericalViolations = [
      { command: "set_sample_rate", params: { rate: -1 } },        // negative sample rate
      { command: "set_depth", params: { depth: -5 } },            // negative depth
      { command: "set_precision", params: { prec: "invalid" } },  // invalid precision string
    ];

    for (const cmd of numericalViolations) {
      const result = grammar.parse(cmd.command, cmd.params);
      expect(result.valid).toBe(false);
    }
  });

  test("rejects commands violating topological invariants", () => {
    const grammar = new NavigationGrammar();

    const topologicalViolations = [
      { command: "merge_meshes", params: { merge: "invalid_merge" } },  // invalid merge operation
      { command: "split_mesh", params: { split: "non_manifold" } },     // non-manifold split
    ];

    for (const cmd of topologicalViolations) {
      const result = grammar.parse(cmd.command, cmd.params);
      expect(result.valid).toBe(false);
    }
  });

  test("rejects commands violating temporal invariants", () => {
    const grammar = new NavigationGrammar();

    const temporalViolations = [
      { command: "set_time_acceleration", params: { accel: -0.5 } },  // negative time acceleration
      { command: "skip_frame", params: { frames: 0 } },              // zero frames to skip
    ];

    for (const cmd of temporalViolations) {
      const result = grammar.parse(cmd.command, cmd.params);
      expect(result.valid).toBe(false);
    }
  });
});

describe("Replayable Navigation", () => {
  test("produces deterministic navigation under replay", () => {
    const grammar = new NavigationGrammar();

    const navigationSeq1 = grammar.generateSequence("patrol", { duration: 10.0, waypoints: 5 });
    const navigationSeq2 = grammar.generateSequence("patrol", { duration: 10.0, waypoints: 5 });

    // Same parameters should produce same navigation sequence
    expect(navigationSeq1.waypoints).toEqual(navigationSeq2.waypoints);
    expect(navigationSeq1.totalDistance).toBe(navigationSeq2.totalDistance);
    expect(navigationSeq1.determinismClass).toBe(navigationSeq2.determinismClass);
  });

  test("navigation replay maintains constitutional compliance", () => {
    const grammar = new NavigationGrammar();

    const replay1 = grammar.replaySequence("explore", { startPos: "x0", duration: 5.0 });
    const replay2 = grammar.replaySequence("explore", { startPos: "x0", duration: 5.0 });

    // Replay should be deterministic
    expect(replay1.trajectory).toEqual(replay2.trajectory);
    expect(replay1.invariantsCompliance).toBe(true);
    expect(replay1.determinismClass).toBe("D2_NUMERICAL");  // or appropriate class
  });

  test("navigation replay preserves invariant surface", () => {
    const grammar = new NavigationGrammar();

    const replay1 = grammar.replaySequence("navigate", { path: "circular", radius: 1.0 });
    const replay2 = grammar.replaySequence("navigate", { path: "circular", radius: 1.0 });

    // Both replays should maintain same invariant surface
    expect(replay1.invariantSurface).toBe(replay2.invariantSurface);
    expect(replay1.invariantSurface).toBeDefined();
  });
});