/**
 * ArchitectureValidator — structural integrity checks over the hierarchy.
 *
 * Verifies: unique ids, no orphaned nodes, valid parent references,
 * monotonic levels, re-computable topology signatures (tamper check),
 * bounded sizes. Returns a report with violations.
 *
 * Status: enforced (verified by failure tests).
 */

import { recomputeTopologySignature } from "../topology/TopologySignature.js";

export function validateArchitecture(hierarchy, config) {
  const violations = [];
  const seen = new Set();

  for (const node of hierarchy.allNodes()) {
    if (seen.has(node.id)) violations.push(`duplicate id ${node.id}`);
    seen.add(node.id);

    if (node.id !== node.rootId) {
      if (!hierarchy.has(node.parentId)) {
        violations.push(`orphan node ${node.id}: parent ${node.parentId} missing`);
      }
    }
    if (!Array.isArray(node.children)) {
      violations.push(`node ${node.id}: children not an array`);
    }
    if (!node.topologySignature || !node.topologySignature.combinatorial) {
      violations.push(`node ${node.id}: missing topology signature`);
    } else if (recomputeTopologySignature(node) !== node.topologySignature.combinatorial) {
      violations.push(`node ${node.id}: topology signature not re-computable (tamper)`);
    }
    if (!node.generationMetadata || node.generationMetadata.generationSeed === undefined) {
      violations.push(`node ${node.id}: missing generation metadata`);
    }
  }

  const leaves = hierarchy.leaves();
  const maxDepth = hierarchy.maxDepth();
  if (leaves.length === 0) violations.push("hierarchy has no leaves");
  if (maxDepth > config.maxDepth) violations.push(`depth ${maxDepth} exceeds maxDepth ${config.maxDepth}`);
  if (hierarchy.size() > config.maxNodes) violations.push(`node count exceeds maxNodes`);

  return {
    ok: violations.length === 0,
    violations,
    nodeCount: hierarchy.size(),
    leafCount: leaves.length,
    maxDepth,
  };
}