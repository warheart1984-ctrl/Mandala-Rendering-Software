/** Invariants tests — InvariantEngine, validateInvariants, validateArchitecture. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { validateInvariants, validateArchitecture, invariantPredicates, INVARIANT_IDS } from "../validation/InvariantEngine.js";
import { ProvenanceLedger } from "../evidence/ProvenanceLedger.js";

describe("SingularityTree Invariants", () => {
  let root;
  let hierarchy;
  let ledger;

  beforeEach(async () => {
    root = createRoot({});
    const { hierarchy: h } = (await import("../refinement/RefinementEngine.js")).generateHierarchy(root, { ledger });
    hierarchy = h;
    ledger = new ProvenanceLedger(root.config);
  });

  describe( "INVARIANT_IDS", () => {
    it( "lists all invariant identifiers", () => {
      assert.ok(Array.isArray(INVARIANT_IDS));
      assert.ok(INVARIANT_IDS.length === 10);
    });
  });

  describe( "invariantPredicates", () => {
    it( "all invariant predicates are functions", () => {
      for (const [id, pred] of Object.entries(invariantPredicates)) {
        assert.ok(typeof pred === "function", `predicate ${id} is not a function`);
      }
    });
  });

  describe( "validateInvariants", () => {
    it( "returns passed/total counts", () => {
      const result = validateInvariants({ root, hierarchy, config: root.config, ledger });
      assert.ok(result !== undefined);
      assert.ok(typeof result.passed === "number");
      assert.ok(typeof result.total === "number");
    });

    it( "returns ok boolean", () => {
      const result = validateInvariants({ root, hierarchy, config: root.config, ledger });
      assert.ok(typeof result.ok === "boolean");
    });
  });

  describe( "all 10 invariants pass on baseline", () => {
    it( "baseline invariants all pass", () => {
      const result = validateInvariants({ root, hierarchy, config: root.config, ledger });
      assert.strictEqual(result.ok, true, `invariants failed: ${JSON.stringify(result.details)}`);
    });
  });
});