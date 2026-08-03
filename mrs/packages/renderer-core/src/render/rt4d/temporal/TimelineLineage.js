import { TEMPORAL_OP_TYPES } from "./TemporalOp.js";
import { createTemporalEvidenceEnvelope } from "./TemporalEvidenceEnvelope.js";

/**
 * Immutable timeline lineage graph (version-control + simulation model).
 * Merge never overwrites parents; creates a new node with two parents.
 */

/**
 * @typedef {object} TimelineNode
 * @property {string} timelineId
 * @property {string[]} parentTimelineIds
 * @property {string} [stateHash]
 * @property {string} [label]
 * @property {"active"|"pruned"|"merged-derived"} status
 */

/**
 * @returns {{nodes: Map<string, TimelineNode>}}
 */
export function createLineageStore() {
  return { nodes: new Map() };
}

/**
 * @param {ReturnType<typeof createLineageStore>} store
 * @param {string} timelineId
 * @param {{stateHash?: string, label?: string}} [meta]
 * @returns {TimelineNode}
 */
export function ensureRoot(store, timelineId, meta = {}) {
  if (store.nodes.has(timelineId)) {
    return /** @type {TimelineNode} */ (store.nodes.get(timelineId));
  }
  const node = {
    timelineId,
    parentTimelineIds: [],
    stateHash: meta.stateHash ?? "root",
    label: meta.label,
    status: /** @type {const} */ ("active"),
  };
  store.nodes.set(timelineId, node);
  return node;
}

/**
 * Fork: create child with exactly one parent. Parent remains immutable.
 * @param {ReturnType<typeof createLineageStore>} store
 * @param {{sourceTimelineId: string, resultTimelineId: string, sourceEventId?: string, parentStateHash?: string, resultStateHash?: string, metric?: object, observerFrame?: object}} req
 */
export function forkTimeline(store, req) {
  const parent = store.nodes.get(req.sourceTimelineId);
  if (!parent) {
    throw new Error(`fork: unknown sourceTimelineId ${req.sourceTimelineId}`);
  }
  if (store.nodes.has(req.resultTimelineId)) {
    throw new Error(`fork: resultTimelineId already exists ${req.resultTimelineId}`);
  }
  const child = {
    timelineId: req.resultTimelineId,
    parentTimelineIds: [req.sourceTimelineId],
    stateHash: req.resultStateHash ?? `${parent.stateHash}:fork`,
    status: /** @type {const} */ ("active"),
  };
  store.nodes.set(req.resultTimelineId, child);

  const envelope = createTemporalEvidenceEnvelope({
    operationId: `fork-${req.resultTimelineId}`,
    operationType: TEMPORAL_OP_TYPES.FORK,
    sourceTimelineId: req.sourceTimelineId,
    sourceEventId: req.sourceEventId,
    resultTimelineId: req.resultTimelineId,
    metric: req.metric ?? { type: "euclidean", signature: "++++" },
    observerFrame: req.observerFrame,
    parentStateHash: req.parentStateHash ?? parent.stateHash ?? "unknown",
    resultStateHash: child.stateHash,
    evidenceStatus: "substrate_verified",
  });

  return { child, parent, envelope };
}

/**
 * Merge attempt — Phase-1: never overwrite parents; detect trivial stateHash conflict.
 * Full causal/identity reconciliation remains **declared**.
 *
 * @param {ReturnType<typeof createLineageStore>} store
 * @param {{parentA: string, parentB: string, resultTimelineId: string, allowConflict?: boolean}} req
 */
export function mergeTimelines(store, req) {
  const a = store.nodes.get(req.parentA);
  const b = store.nodes.get(req.parentB);
  if (!a || !b) {
    throw new Error("merge: both parents must exist");
  }
  if (store.nodes.has(req.resultTimelineId)) {
    throw new Error(`merge: resultTimelineId already exists ${req.resultTimelineId}`);
  }

  const conflicts = [];
  if (a.stateHash && b.stateHash && a.stateHash !== b.stateHash) {
    conflicts.push({
      code: "state_hash_divergence",
      message:
        "Parent state hashes differ; automatic merge is unsafe without causal reconciliation (declared).",
    });
  }

  if (conflicts.length && !req.allowConflict) {
    return {
      ok: false,
      conflicts,
      parents: [a, b],
      derived: null,
      envelope: createTemporalEvidenceEnvelope({
        operationId: `merge-denied-${req.resultTimelineId}`,
        operationType: TEMPORAL_OP_TYPES.MERGE,
        sourceTimelineId: req.parentA,
        resultTimelineId: req.resultTimelineId,
        parentTimelineIds: [req.parentA, req.parentB],
        metric: { type: "euclidean", signature: "++++" },
        causalValidation: { passed: false, violations: conflicts.map((c) => c.code) },
        parentStateHash: `${a.stateHash}|${b.stateHash}`,
        resultStateHash: "merge-denied",
        evidenceStatus: "declared",
      }),
      status: "declared",
    };
  }

  const derived = {
    timelineId: req.resultTimelineId,
    parentTimelineIds: [req.parentA, req.parentB],
    stateHash: `merge(${a.stateHash},${b.stateHash})`,
    status: /** @type {const} */ ("merged-derived"),
  };
  store.nodes.set(req.resultTimelineId, derived);

  return {
    ok: true,
    conflicts,
    parents: [a, b],
    derived,
    envelope: createTemporalEvidenceEnvelope({
      operationId: `merge-${req.resultTimelineId}`,
      operationType: TEMPORAL_OP_TYPES.MERGE,
      sourceTimelineId: req.parentA,
      resultTimelineId: req.resultTimelineId,
      parentTimelineIds: [req.parentA, req.parentB],
      metric: { type: "euclidean", signature: "++++" },
      causalValidation: {
        passed: conflicts.length === 0,
        violations: conflicts.map((c) => c.code),
      },
      parentStateHash: `${a.stateHash}|${b.stateHash}`,
      resultStateHash: derived.stateHash,
      evidenceStatus: conflicts.length ? "declared" : "substrate_verified",
    }),
    status: conflicts.length ? "declared" : "partial",
  };
}
