import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot, normalizeSingularityTreeConfig } from "../index.js";

describe("SingularityTree Root", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe("createRoot", () => {
    it("creates root with valid id", () => {
      assert.strictEqual(root.id, "root");
    });

    it("creates root with generation metadata", () => {
      assert.strictEqual(root.generationMetadata.generationRule, "singularity-root.v1");
      assert(typeof root.generationMetadata.generationSeed === "number");
      assert.strictEqual(root.generationMetadata.dof, 2);
    });

    it( "creates root with deterministic seed", () => {
      const r = createRoot({ deterministicSeed: 0xcafebabe });
      assert.strictEqual(r.seed, 0xcafebabe);
    });

    it( "root.state is frozen", () => {
      assert.strictEqual(Object.isFrozen(root.state), true);
    });
  });

  describe("normalizeSingularityTreeConfig", () => {
    it("validates config and returns frozen object", () => {
      const cfg = normalizeSingularityTreeConfig({});
      assert.ok(Object.isFrozen(cfg));
    });

    it( "throws on minBranchFactor > maxBranchFactor", () => {
      assert.throws(() => normalizeSingularityTreeConfig({ minBranchFactor: 5, maxBranchFactor: 3 }), TypeError);
    });

    it( "accepts valid user config merge", () => {
      const cfg = normalizeSingularityTreeConfig({ maxDepth: 8 });
      assert.strictEqual(cfg.maxDepth, 8);
    });
  });
});