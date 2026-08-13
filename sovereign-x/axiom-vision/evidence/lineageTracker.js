/**
 * Axiom Vision — Lineage Tracker.
 *
 * Maintains the hash chain from L0 (image) through all levels.
 * Each feature's provenance.feature_hash feeds into parent_hash of the next level.
 * Produces a Merkle root for the entire evidence graph.
 */

import { sha256Hex, canonicalJSON } from "./sha256.js";

/**
 * Compute a level hash from all feature hashes at that level.
 * This becomes the parent_hash for the next level.
 *
 * @param {Object[]} features - Array of evidence objects at a level
 * @returns {string} SHA-256 of sorted feature hashes concatenated
 */
export function computeLevelHash(features) {
  if (!features || features.length === 0) {
    return sha256Hex("empty_level");
  }
  const sorted = features
    .map(f => f.provenance?.feature_hash)
    .filter(Boolean)
    .sort();
  return sha256Hex(sorted.join(""));
}

/**
 * Compute the Merkle root of the entire evidence graph.
 *
 * @param {Object} evidenceGraph - { L0, L1, L2, L3, L4, L5 } feature arrays
 * @returns {string} Final Merkle root hash
 */
export function computeMerkleRoot(evidenceGraph) {
  const levelHashes = [];

  // L0: image hash
  if (evidenceGraph.L0?.image_hash) {
    levelHashes.push(evidenceGraph.L0.image_hash);
  }

  // L1-L5: level hashes
  for (const level of ["L1", "L2", "L3", "L4", "L5"]) {
    if (evidenceGraph[level] && evidenceGraph[level].length > 0) {
      levelHashes.push(computeLevelHash(evidenceGraph[level]));
    }
  }

  return sha256Hex(levelHashes.join(""));
}

/**
 * Build the full provenance chain for a single feature.
 * Traces parent_features up through all levels to L0.
 *
 * @param {Object} feature - The feature to trace
 * @param {Object} evidenceGraph - Full evidence graph
 * @returns {Object[]} Chain of { level, feature_id, feature_hash } from feature to root
 */
export function traceLineage(feature, evidenceGraph) {
  const chain = [];
  const visited = new Set();
  const queue = [feature];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.feature_id)) continue;
    visited.add(current.feature_id);

    chain.push({
      level: current.level,
      feature_id: current.feature_id,
      type: current.type,
      feature_hash: current.provenance?.feature_hash,
      constitutional_tag: current.constitutional_tag ?? null,
    });

    // Follow parent links
    if (current.parent_features) {
      for (const parentId of current.parent_features) {
        const parent = findFeatureById(parentId, evidenceGraph);
        if (parent) queue.push(parent);
      }
    }
  }

  // Sort by level for clean output
  return chain.sort((a, b) => a.level - b.level);
}

/**
 * Find a feature by its ID across all levels.
 */
function findFeatureById(featureId, evidenceGraph) {
  for (const level of ["L1", "L2", "L3", "L4", "L5"]) {
    const found = evidenceGraph[level]?.find(f => f.feature_id === featureId);
    if (found) return found;
  }
  return null;
}

/**
 * Verify that a feature's hash chain is intact.
 * Recomputes hashes and compares.
 *
 * @param {Object} feature
 * @param {Object} evidenceGraph
 * @returns {boolean}
 */
export function verifyLineage(feature, evidenceGraph) {
  const chain = traceLineage(feature, evidenceGraph);
  for (const link of chain) {
    const original = findFeatureById(link.feature_id, evidenceGraph);
    if (!original) return false;
    if (original.provenance?.feature_hash !== link.feature_hash) return false;
  }
  return true;
}
