/**
 * Temporal operations for Timeline Mode (Layer 6 thin).
 * Status: **partial** — fork/lineage tested; merge conflict policy **declared**.
 */

export const TEMPORAL_OP_TYPES = Object.freeze({
  SLICE_VIEW: "slice_view",
  REWIND: "rewind",
  FORK: "fork",
  FAST_FORWARD: "fast_forward",
  SIMULATE: "simulate",
  COMPARE: "compare",
  PRUNE: "prune",
  MERGE: "merge",
});

/** @typedef {typeof TEMPORAL_OP_TYPES[keyof typeof TEMPORAL_OP_TYPES]} TemporalOpType */

/**
 * @param {string} type
 * @returns {type is TemporalOpType}
 */
export function isTemporalOpType(type) {
  return Object.values(TEMPORAL_OP_TYPES).includes(type);
}
