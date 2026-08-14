/**
 * Hierarchy — the partially ordered set of generative states (L1).
 *
 * Keyed by stable id; every node except the root must have exactly one valid
 * parent that is itself present in the hierarchy (no orphans). Provides
 * traversal helpers used by refinement, continuum assembly and validation.
 *
 * Status: enforced (verified by hierarchy + invariant tests).
 */

import { lineageFromBranchPath } from "./Lineage.js";

export class Hierarchy {
  constructor(root) {
    this.rootId = root.id;
    this.nodes = new Map();
    this.register(root);
    this.evidence = new Map(); // nodeId -> evidence record ids
  }

  register(node) {
    if (this.nodes.has(node.id)) {
      throw new Error(`Hierarchy: duplicate node id ${node.id}`);
    }
    this.nodes.set(node.id, node);
    return node;
  }

  /** Lineage for a node (reconstructed from branchPath; root-safe). */
  lineageOf(node) {
    return lineageFromBranchPath(node.branchPath || []);
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  getRoot() {
    return this.nodes.get(this.rootId);
  }

  has(id) {
    return this.nodes.has(id);
  }

  size() {
    return this.nodes.size;
  }

  childrenOf(id) {
    const parent = this.nodes.get(id);
    return parent ? parent.children.map((c) => this.nodes.get(c.id)) : [];
  }

  leaves() {
    const out = [];
    for (const node of this.nodes.values()) {
      if (node.isLeaf || node.children.length === 0) out.push(node);
    }
    return out;
  }

  allNodes() {
    return [...this.nodes.values()];
  }

  /** BFS order (generation order). */
  orderedNodes() {
    const out = [];
    const queue = [this.getRoot()];
    while (queue.length > 0) {
      const node = queue.shift();
      out.push(node);
      for (const child of node.children) {
        const c = this.nodes.get(child.id);
        if (c) queue.push(c);
      }
    }
    return out;
  }

  maxDepth() {
    let max = 0;
    for (const node of this.nodes.values()) {
      if (node.level > max) max = node.level;
    }
    return max;
  }

  nodeCount() {
    return this.nodes.size;
  }

  linkEvidence(nodeId, evidenceId) {
    if (!this.evidence.has(nodeId)) this.evidence.set(nodeId, []);
    this.evidence.get(nodeId).push(evidenceId);
  }

  getEvidenceIds(nodeId) {
    return this.evidence.get(nodeId) || [];
  }
}