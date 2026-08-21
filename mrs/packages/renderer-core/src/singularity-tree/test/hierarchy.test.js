/** Hierarchy tests — Hierarchy class, lineage, traversal, node access. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { Hierarchy } from "../hierarchy/Hierarchy.js";

describe("SingularityTree Hierarchy", () => {
  let root;
  let hierarchy;

  beforeEach(() => {
    root = createRoot({});
    hierarchy = new Hierarchy(root);
  });

  describe("constructor", () => {
    it("creates hierarchy with root registered", () => {
      assert.ok(hierarchy.has(root.id));
    });

    it("rootId is set from root", () => {
      assert.strictEqual(hierarchy.rootId, root.id);
    });
  });

  describe( "getNode / has / size", () => {
    it( "getNode returns root initially", () => {
      assert.ok(hierarchy.getNode(root.id) === hierarchy.getRoot());
    });

    it( "size is 1 initially (only root)", () => {
      assert.strictEqual(hierarchy.size(), 1);
    });

    it( "has returns true for root", () => {
      assert.strictEqual(hierarchy.has(root.id), true);
    });
  });

  describe( "childrenOf / leaves / allNodes", () => {
    it( "leaves returns root when no children added", () => {
      const leaves = hierarchy.leaves();
      assert.strictEqual(leaves.length, 1);
      assert.strictEqual(leaves[0].id, root.id);
    });

    it( "allNodes returns root", () => {
      assert.strictEqual(hierarchy.allNodes().length, 1);
      assert.strictEqual(hierarchy.allNodes()[0].id, root.id);
    });

    it( "lineageOf works for root (empty branchPath)", () => {
      const lineage = hierarchy.lineageOf(root);
      assert.ok(Array.isArray(lineage));
    });
  });

  describe( "orderedNodes (BFS)", () => {
    it( "orderedNodes returns root first", () => {
      const ordered = hierarchy.orderedNodes();
      assert.strictEqual(ordered[0].id, root.id);
    });

    it( "orderedNodes iterates level by level", () => {
      const ordered = hierarchy.orderedNodes();
      assert.strictEqual(ordered[0].level, 0);
    });
  });

  describe( "maxDepth", () => {
    it( "maxDepth is 0 when only root exists", () => {
      assert.strictEqual(hierarchy.maxDepth(), 0);
    });
  });
});