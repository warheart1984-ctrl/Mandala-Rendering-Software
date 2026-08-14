/**
 * TopologySignature — creation-time, stable topology signature of a node.
 *
 * Topology is a global invariant. Each node stores:
 *   - class: the global topological class (default S³ target). Geometry may
 *     change freely; class must not change without explicit authorization.
 *   - combinatorial: a deterministic fingerprint over the node's identity
 *     (class, level, branchPath, state hash). It is stable at creation time,
 *     so the root can remain immutable, and it is re-computable for audit
 *     (see validation/ArchitectureValidator.js).
 *
 * Status: enforced (verified by topology tests + invariant 5).
 */

import { hashState } from "../determinism/StateHasher.js";

export function topologyClassOf(node) {
  if (node && node.topologySignature) {
    return node.topologySignature.class;
  }
  if (node && node.state && node.state.topologySignature) {
    return node.state.topologySignature.class;
  }
  return null;
}

/** Creation-time combinatorial signature (children-independent). */
export function createTopologySignature(node, config) {
  const cls = config.topologyTarget;
  const combinatorial = hashState({
    kind: "topology.combinatorial.v1",
    class: cls,
    level: node.level,
    branchPath: node.branchPath || [],
    stateHash: node.state.stateHash,
  }).slice(0, 16);
  return Object.freeze({ class: cls, combinatorial });
}

/** Re-computable fingerprint used by the audit validator. */
export function recomputeTopologySignature(node) {
  return hashState({
    kind: "topology.combinatorial.v1",
    class: topologyClassOf(node),
    level: node.level,
    branchPath: node.branchPath || [],
    stateHash: node.state.stateHash,
  }).slice(0, 16);
}