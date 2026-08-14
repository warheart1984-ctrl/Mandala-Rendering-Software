/**
 * HierarchyNode — a node of the Yggdrasil hierarchy.
 *
 * Node {
 *   id, parentId, level, state, lineage, children,
 *   topologySignature, geometrySignature, generationMetadata
 * }
 *
 * A child always contains a valid reference to its parent. No orphaned
 * generative nodes are permitted (enforced by Hierarchy + validator).
 *
 * Status: enforced (verified by hierarchy tests + invariant 2).
 */

export function createNode({
  id,
  parentId,
  rootId,
  level,
  state,
  topologySignature,
  geometrySignature = null,
  branchPath,
  generationSeed,
  generationRule,
  createdBy,
  selfSimilarityClass = null,
  children = [],
  associations = [],
  isLeaf = false,
  geometry = null,
}) {
  return {
    id,
    parentId,
    rootId,
    level,
    state,
    topologySignature,
    geometrySignature,
    branchPath,
    lineage: null, // filled by Hierarchy when registered
    children,
    associations,
    generationMetadata: {
      generationSeed: generationSeed >>> 0,
      generationRule,
      createdBy,
      selfSimilarityClass,
    },
    isLeaf,
    geometry,
  };
}

export function nodeIsRoot(node) {
  return node.parentId === null || node.id === node.rootId;
}