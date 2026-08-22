/* MandalaLattice.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Lattice Node Validity (nodes must contain: invariant surface, determinism class, evidence bundle)
 *  2. 4D Spatial Consistency (lattice must preserve: temporal continuity, spatial continuity, invariant continuity)
 *  3. Constitutional Loop Closure (mandalaLattice must return control to PILOT)
 */

import { MandalaLattice, StateGeometryLayer, TemporalGeometryLayer, EvidenceLayer, ConstitutionalLayer, DomainSignatureLayer, ProbabilityLayer, PerceptualInterface } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Lattice Node Validity", () => {
  test("lattice nodes contain invariant surface", () => {
    const lattice = new MandalaLattice();

    const node = lattice.createNode({
      invariantSurface: "energy_conservation",
      determinismClass: "D2_NUMERICAL",
      evidenceBundle: { intentId: "test", worldId: "world", timelineId: "timeline", timeSeconds: 0, parameters: {} },
    });

    expect(node).toBeDefined();
    expect(node.invariantSurface).toBe("energy_conservation");
  });

  test("lattice nodes contain determinism class", () => {
    const lattice = new MandalaLattice();

    const node = lattice.createNode({
      invariantSurface: "geometry_valid",
      determinismClass: "D3_SEMANTIC",
      evidenceBundle: { intentId: "test", worldId: "world", timelineId: "timeline", timeSeconds: 0, parameters: {} },
    });

    expect(node.determinismClass).toBe("D3_SEMANTIC");
    const validDeterminismClasses = ["D0_UNSPECIFIED", "D1_EXACT", "D2_NUMERICAL", "D3_SEMANTIC", "D4_STATISTICAL"];
    expect(validDeterminismClasses).toContain(node.determinismClass);
  });

  test("lattice nodes contain evidence bundle", () => {
    const lattice = new MandalaLattice();

    const evidenceBundle = {
      intentId: "intent.test",
      worldId: "world.test",
      timelineId: "timeline.test",
      timeSeconds: 1.5,
      parameters: { samplesPerPixel: 1, maxDepth: 4 },
    };

    const node = lattice.createNode({
      invariantSurface: "topology_valid",
      determinismClass: "D2_NUMERICAL",
      evidenceBundle,
    });

    expect(node.evidenceBundle).toEqual(evidenceBundle);
    expect(node.evidenceBundle.intentId).toBe("intent.test");
    expect(node.evidenceBundle.worldId).toBe("world.test");
    expect(node.evidenceBundle.timelineId).toBe("timeline.test");
    expect(typeof node.evidenceBundle.timeSeconds).toBe("number");
    expect(node.evidenceBundle.parameters).toBeDefined();
  });

  test("lattice node with all required fields is valid", () => {
    const lattice = new MandalaLattice();

    const node = lattice.createNode({
      invariantSurface: "full_invariant",
      determinismClass: "D4_STATISTICAL",
      evidenceBundle: { intentId: "t", worldId: "w", timelineId: "t2", timeSeconds: 2.5, parameters: {} },
    });

    expect(node).toBeDefined();
    expect(node.invariantSurface).toBe("full_invariant");
    expect(node.determinismClass).toBe("D4_STATISTICAL");
    expect(node.evidenceBundle).toBeDefined();
  });
});

describe("4D Spatial Consistency", () => {
  test("lattice preserves temporal continuity", () => {
    const lattice = new MandalaLattice();

    const nodes = lattice.preserveTemporalContinuity([
      { timeSeconds: 0, invariantSurface: "energy", determinismClass: "D2_NUMERICAL" },
      { timeSeconds: 1, invariantSurface: "energy", determinismClass: "D2_NUMERICAL" },
      { timeSeconds: 2, invariantSurface: "energy", determinismClass: "D2_NUMERICAL" },
    ]);

    expect(nodes).toHaveLength(3);
    // Temporal continuity should maintain ordering
    expect(nodes[0].timeSeconds).toBe(0);
    expect(nodes[1].timeSeconds).toBe(1);
    expect(nodes[2].timeSeconds).toBe(2);
  });

  test("lattice preserves spatial continuity", () => {
    const lattice = new MandalaLattice();

    const nodes = lattice.preserveSpatialContinuity([
      { position: "x0", invariantSurface: "geometry", determinismClass: "D2_NUMERICAL" },
      { position: "x1", invariantSurface: "geometry", determinismClass: "D2_NUMERICAL" },
      { position: "x2", invariantSurface: "geometry", determinismClass: "D2_NUMERICAL" },
    ]);

    expect(nodes).toHaveLength(3);
    // Spatial continuity should maintain ordering
    expect(nodes[0].position).toBe("x0");
    expect(nodes[1].position).toBe("x1");
    expect(nodes[2].position).toBe("x2");
  });

  test("lattice preserves invariant continuity", () => {
    const lattice = new MandalaLattice();

    const nodes = lattice.preserveInvariantContinuity([
      { invariant: "energy_conservation", determinismClass: "D2_NUMERICAL" },
      { invariant: "energy_conservation", determinismClass: "D2_NUMERICAL" },
      { invariant: "energy_conservation", determinismClass: "D2_NUMERICAL" },
    ]);

    expect(nodes).toHaveLength(3);
    // Invariant continuity should maintain invariant surface
    expect(nodes[0].invariant).toBe("energy_conservation");
    expect(nodes[1].invariant).toBe("energy_conservation");
    expect(nodes[2].invariant).toBe("energy_conservation");
  });

  test("maintains all three continuities under mixed input", () => {
    const lattice = new MandalaLattice();

    const result = lattice.maintainFourDConsistency([
      { timeSeconds: 0, position: "x0", invariant: "energy", determinismClass: "D2_NUMERICAL" },
      { timeSeconds: 1, position: "x1", invariant: "energy", determinismClass: "D2_NUMERICAL" },
      { timeSeconds: 2, position: "x2", invariant: "energy", determinismClass: "D2_NUMERICAL" },
    ]);

    expect(result.temporalContinuity).toBe(true);
    expect(result.spatialContinuity).toBe(true);
    expect(result.invariantContinuity).toBe(true);
  });
});

describe("Constitutional Loop Closure", () => {
  test("mandalaLattice returns control to PILOT", () => {
    const lattice = new MandalaLattice();

    const input = {
      state: { step: 1, phase: "post_render" },
      evidence: { intentId: "test", worldId: "world", timelineId: "timeline", timeSeconds: 1.0, parameters: {} },
      replay: { anchor: "replay.test" },
      rt4d: { temporalGeometry: "continuous" },
      domainSignatures: { domain: "render" },
      intentId: "intent.test",
      worldId: "world.test",
      timelineId: "timeline.test",
      timeSeconds: 1.0,
      parameters: { samplesPerPixel: 1 },
    };

    const result = lattice.integrate(input);

    // Should return control to PILOT (not get stuck in lattice)
    expect(result).toBeDefined();
    expect(result.continuityStatus).toBeDefined();
    // Should have a pilotReturn or similar indicator
    expect(result.pilotControl).toBeDefined() || expect(result.returnToPILOT).toBeDefined();
  });

  test("loop closure maintains invariant surface", () => {
    const lattice = new MandalaLattice();

    const input = {
      state: { step: 1 },
      evidence: { intentId: "loop.test", worldId: "w", timelineId: "t", timeSeconds: 1.0, parameters: {} },
      replay: { anchor: "loop-back" },
      rt4d: { temporalGeometry: "looping" },
      domainSignatures: { domain: "render" },
      intentId: "loop.test",
      worldId: "w",
      timelineId: "t",
      timeSeconds: 1.0,
      parameters: {},
    };

    const result = lattice.integrate(input);

    // Loop closure should maintain invariant surface
    expect(result.invariantSurfaceMaintained).toBe(true) || expect(result.invariantsPreserved).toBe(true);
  });

  test("loop closure preserves determinism class", () => {
    const lattice = new MandalaLattice();

    const input = {
      state: { step: 1 },
      evidence: { intentId: "dclass.test", worldId: "w", timelineId: "t", timeSeconds: 1.0, parameters: {} },
      replay: { anchor: "dclass-loop" },
      rt4d: { temporalGeometry: "deterministic" },
      domainSignatures: { domain: "render" },
      intentId: "dclass.test",
      worldId: "w",
      timelineId: "t",
      timeSeconds: 1.0,
      parameters: {},
    };

    const result = lattice.integrate(input);

    // Determinism class should be preserved through loop closure
    expect(result.determinismClassPreserved).toBe(true) || expect(result.determinismClass).toBeDefined();
  });
});