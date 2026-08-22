/** Differentiation tests — ThresholdEvaluator, DifferentiationEngine. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { evaluateDifferentiation } from "../differentiation/ThresholdEvaluator.js";
import { createDifferentiationState } from "../differentiation/DifferentiationState.js";

describe("SingularityTree Differentiation", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe("evaluateDifferentiation", () => {
    it("returns differentiate:true when potential > threshold", () => {
      const state = createDifferentiationState({ potential: 0.2, state: { x: 1, y: 0, z: 0, w: 0 } });
      const gate = evaluateDifferentiation(state, 0.12);
      assert.strictEqual(gate.differentiate, true);
    });

    it("returns differentiate:false when potential <= threshold", () => {
      const state = createDifferentiationState({ potential: 0.1, state: { x: 1, y: 0, z: 0, w: 0 } });
      const gate = evaluateDifferentiation(state, 0.12);
      assert.strictEqual(gate.differentiate, false);
    });

    it("handles zero potential", () => {
      const state = createDifferentiationState({ potential: 0, state: { x: 0, y: 0, z: 0, w: 0 } });
      const gate = evaluateDifferentiation(state, 0.12);
      assert.strictEqual(gate.differentiate, false);
    });
  });

  describe("createDifferentiationState", () => {
    it( "freezes the state object", () => {
      const ds = createDifferentiationState({ potential: 0.18, state: { x: 0.6, y: 0.2, z: -0.3, w: 0.1 } });
      assert.ok(Object.isFrozen(ds));
    });

    it( "has required fields", () => {
      const ds = createDifferentiationState({ potential: 0.22, state: { x: 1, y: 0, z: 0, w: 0 } });
      assert.ok(ds.potential !== undefined);
      assert.ok(ds.state !== undefined);
    });
  });
});