/** Failure tests — SingularityTreeLimitError, fail-closed boundaries. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { SingularityTreeLimitError } from "../refinement/RefinementPolicy.js";

describe("SingularityTree Failure", () => {
  describe( "SingularityTreeLimitError", () => {
    it( "has error code SINGULARITY_TREE_LIMIT", () => {
      try {
        throw new SingularityTreeLimitError("test limit reached");
      } catch (e) {
        assert.strictEqual(e.code, "SINGULARITY_TREE_LIMIT");
        assert.strictEqual(e.message, "test limit reached");
      }
    });

    it( "can be caught and identified", () => {
      let caught;
      try {
        throw new SingularityTreeLimitError("resource exceeded");
      } catch (e) {
        caught = e;
      }
      assert.ok(caught instanceof SingularityTreeLimitError);
    });
  });

  describe( "fail-closed depth termination", () => {
    it( "refinement terminates at maxDepth as graceful leaf", async () => {
      const root = createRoot({ maxDepth: 2 });
      const { hierarchy } = (await import("../refinement/RefinementEngine.js")).generateHierarchy(root, { ledger: null });
      const maxD = hierarchy.maxDepth();
      assert.ok(maxD <= 2);
    });
  });

  describe( "fail-closed node limit", () => {
    it( "maxNodes limit stored in config", () => {
      const root = createRoot({ maxNodes: 5, maxDepth: 10 });
      assert.strictEqual(root.config.maxNodes, 5);
    });
  });

  describe( "fail-closed expansions limit", () => {
    it( "maxExpansions limit stored in config", () => {
      const root = createRoot({ maxExpansions: 3 });
      assert.strictEqual(root.config.maxExpansions, 3);
    });
  });
});