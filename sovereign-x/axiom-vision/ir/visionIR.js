/**
 * Axiom Vision — Vision IR (Intermediate Representation).
 *
 * Assembles the full evidence graph into the canonical output format.
 * This is the final artifact of axiomVision.analyze().
 */

import { computeMerkleRoot } from "../evidence/lineageTracker.js";

export const VISION_IR_VERSION = "1.0.0";

/**
 * Construct the full Vision IR from processed evidence.
 *
 * @param {Object} params
 * @param {Object} params.L0 - { image_hash, width, height, format, byte_length }
 * @param {Object[]} params.L1 - Primitive features
 * @param {Object[]} params.L2 - Geometry features
 * @param {Object[]} params.L3 - Object detections (may be empty without learned models)
 * @param {Object[]} params.L4 - Relations (may be empty without learned models)
 * @param {Object[]} params.L5 - Interpretations (may be empty without LLM)
 * @param {Object} params.metadata - Analysis metadata
 * @returns {Object} Complete Vision IR object
 */
export function buildVisionIR({ L0, L1, L2, L3, L4, L5, metadata }) {
  const evidenceGraph = {
    L0,
    L1: L1 || [],
    L2: L2 || [],
    L3: L3 || [],
    L4: L4 || [],
    L5: L5 || [],
  };

  const merkleRoot = computeMerkleRoot(evidenceGraph);

  return {
    version: `axiom-vision/${VISION_IR_VERSION}`,
    L0: {
      image_hash: L0.image_hash,
      width: L0.width,
      height: L0.height,
      format: L0.format || "rgba8",
      byte_length: L0.byte_length || 0,
      source: L0.source || "buffer",
    },
    evidence_graph: {
      L1: evidenceGraph.L1,
      L2: evidenceGraph.L2,
      L3: evidenceGraph.L3,
      L4: evidenceGraph.L4,
      L5: evidenceGraph.L5,
    },
    metadata: {
      analysis_timestamp: new Date().toISOString(),
      pipeline_duration_ms: metadata.durationMs || 0,
      tile_count: metadata.tileCount || 1,
      worker_count: metadata.workerCount || 1,
      kernels_used: metadata.kernelsUsed || [],
      deterministic_levels: "0-2",
      learned_levels: "3-4",
      interpretation_level: 5,
      constitutional_boundary: "OBSERVATION ≠ INTERPRETATION",
    },
    lineage_root: merkleRoot,
  };
}
