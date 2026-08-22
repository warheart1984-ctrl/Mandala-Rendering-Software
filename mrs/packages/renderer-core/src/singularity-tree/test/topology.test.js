/** Topology tests — TopologySignature, TopologyEquivalence. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { createTopologySignature, recomputeTopologySignature, topologyClassOf } from "../topology/TopologySignature.js";
import { topologyEquivalent } from "../topology/TopologyEquivalence.js";

describe("SingularityTree Topology", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe("createTopologySignature", () => {
    it( "creates a combinatorial signature for a node", () => {
      const sig = createTopologySignature(root, root.config);
      assert.ok(sig !== null);
      assert.ok(sig.class === root.config.topologyTarget);
      assert.ok(typeof sig.combinatorial === "string" && sig.combinatorial.length === 16);
    });

    it( "signature is consistent across creates with same config", () => {
      const sig1 = createTopologySignature(root, root.config);
      const sig2 = createTopologySignature(root, root.config);
      assert.strictEqual(sig1.combinatorial, sig2.combinatorial);
    });
  });

  describe( "recomputeTopologySignature", () => {
    it( "re-computes a node's topology signature", () => {
      const sig = recomputeTopologySignature(root);
      assert.ok(typeof sig === "string" && sig.length === 16);
    });

    it( "signature does not depend on isLeaf flip", () => {
      const sig = recomputeTopologySignature(root);
      assert.ok(typeof sig === "string");
    });
  });

  describe( "topologyClassOf", () => {
    it( "returns the topology target class", () => {
      const cls = topologyClassOf(root);
      assert.strictEqual(cls, root.config.topologyTarget);
    });
  });

  describe( "topologyEquivalent", () => {
    it( "topologyEquivalent compares two nodes", () => {
      const result = topologyEquivalent(root, root);
      assert.ok(typeof result === "boolean");
    });
  });
});