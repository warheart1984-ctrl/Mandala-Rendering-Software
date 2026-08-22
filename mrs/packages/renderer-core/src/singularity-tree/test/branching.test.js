/** Branching tests — branch, sampleBranchFactor, angularSeparation. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { branch, sampleBranchFactor, angularSeparation } from "../branching/AssociationOperator.js";

describe("SingularityTree Branching", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe("branch", () => {
    it("produces children from a node", () => {
      const { children, branchFactor } = branch(root, root.generationMetadata.generationSeed, root.config);
      assert.ok(Array.isArray(children));
      assert.ok(branchFactor >= 2);
      assert.ok(branchFactor <= root.config.maxBranchFactor);
    });

    it( "branchFactor respects min/max", () => {
      const bf = sampleBranchFactor(root.generationMetadata.generationSeed, root.config);
      assert.ok(typeof bf === "number");
      assert.ok(bf >= root.config.minBranchFactor);
      assert.ok(bf <= root.config.maxBranchFactor);
    });
  });

  describe("angularSeparation", () => {
    it( "computes angular separation between two 4D unit vectors", () => {
      const v1 = { x: 1, y: 0, z: 0, w: 0 };
      const v2 = { x: 0, y: 1, z: 0, w: 0 };
      const sep = angularSeparation(v1, v2);
      assert.ok(typeof sep === "number");
      assert.ok(sep > 0 && sep <= Math.PI);
    });

    it( "returns 0 for identical vectors", () => {
      const v = { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
      const sep = angularSeparation(v, v);
      assert.strictEqual(sep, 0);
    });
  });
});