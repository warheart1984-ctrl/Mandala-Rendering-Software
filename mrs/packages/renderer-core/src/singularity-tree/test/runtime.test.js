/** Runtime tests — runSingularityTree modes, generateWorldForObservation, refineWorldWithFeedback, ABIs. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot, EXECUTION_MODES } from "../index.js";
import { runSingularityTree, generateWorldForObservation, refineWorldWithFeedback } from "../index.js";
import { WorldABI, ComputeABI } from "../index.js";
import { createObservation } from "../refinement/AdaptiveRefinementPolicy.js";
import { ProvenanceLedger } from "../evidence/ProvenanceLedger.js";

describe("SingularityTree Runtime", () => {
  let root;
  let hierarchy;
  let ledger;

  beforeEach(async () => {
    root = createRoot({});
    const { hierarchy: h } = (await import("../refinement/RefinementEngine.js")).generateHierarchy(root, { ledger });
    hierarchy = h;
    ledger = new ProvenanceLedger(root.config);
  });

  describe( "runSingularityTree", () => {
    it( "runs in ANALYZE mode", () => {
      const result = runSingularityTree({}, { mode: EXECUTION_MODES.ANALYZE });
      assert.ok(result !== undefined);
      assert.strictEqual(result.mode, EXECUTION_MODES.ANALYZE);
    });

    it( "runs in GENERATE mode", () => {
      const result = runSingularityTree({}, { mode: EXECUTION_MODES.GENERATE });
      assert.ok(result !== undefined);
      assert.strictEqual(result.mode, EXECUTION_MODES.GENERATE);
    });

    it( "runs in RENDER mode", () => {
      const result = runSingularityTree({}, { mode: EXECUTION_MODES.RENDER });
      assert.ok(result !== undefined);
      assert.strictEqual(result.mode, EXECUTION_MODES.RENDER);
    });

    it( "GENERATE mode has valid invariants", () => {
      const result = runSingularityTree({}, { mode: EXECUTION_MODES.GENERATE });
      assert.ok(result.invariants.ok === true, `invariants failed: ${JSON.stringify(result.invariants.details)}`);
    });

    it( "architecture is valid in GENERATE mode", () => {
      const result = runSingularityTree({}, { mode: EXECUTION_MODES.GENERATE });
      assert.ok(result.architecture.ok === true, `arch violations: ${JSON.stringify(result.architecture.violations)}`);
    });
  });

  describe( "generateWorldForObservation", () => {
    it( "generates a world for an observation", () => {
      const obs = createObservation({ cameraPosition: { x: 2.2, y: 0, z: 0, w: 0 }, focusRadius: 0.55, nearLevel: 7, farLevel: 1 });
      const w = generateWorldForObservation({}, obs);
      assert.ok(w !== undefined);
      assert.ok(w.hierarchy !== undefined);
    });

    it( "adaptive refinement produces level variation", () => {
      const obs = createObservation({ cameraPosition: { x: 2.2, y: 0, z: 0, w: 0 }, focusRadius: 0.55, nearLevel: 7, farLevel: 1 });
      const w = generateWorldForObservation({}, obs);
      const levels = [...new Set(w.hierarchy.leaves().map(l => l.level))].sort();
      assert.ok(levels.length > 1, `expected multiple levels, got ${levels}`);
    });
  });

  describe( "refineWorldWithFeedback", () => {
    it( "refines world with feedback", () => {
      const obs = createObservation({ cameraPosition: { x: 2.2, y: 0, z: 0, w: 0 }, focusRadius: 0.55, nearLevel: 7, farLevel: 1 });
      const fb = refineWorldWithFeedback({}, obs);
      assert.ok(fb !== undefined);
    });
  });

  describe( "WorldABI", () => {
    it( "compileWorldState produces valid world state", () => {
      const ws = WorldABI.compileWorldState(root, root.hierarchy, root.config);
      assert.ok(ws !== undefined);
      assert.ok(ws.abi === "4d-world.v1");
    });

    it( "getWorldMesh produces mesh", () => {
      const ws = WorldABI.compileWorldState(root, root.hierarchy, root.config);
      const mesh = WorldABI.getWorldMesh(ws);
      assert.ok(mesh !== null);
      assert.ok(mesh.vertices !== undefined);
      assert.ok(mesh.edges !== undefined);
    });
  });

  describe( "ComputeABI", () => {
    it( "computeDescriptor is deterministic", () => {
      const ws = WorldABI.compileWorldState(root, root.hierarchy, root.config);
      const p1 = ComputeABI.computeDescriptor(ws);
      const p2 = ComputeABI.computeDescriptor(ws);
      assert.strictEqual(p1.vertexCount, p2.vertexCount);
      assert.strictEqual(p1.edgeCount, p2.edgeCount);
    });

    it( "computePayloadToJSON works", () => {
      const ws = WorldABI.compileWorldState(root, root.hierarchy, root.config);
      const p = ComputeABI.computeDescriptor(ws);
      const json = ComputeABI.computePayloadToJSON(p);
      assert.ok(json !== null);
    });
  });
});