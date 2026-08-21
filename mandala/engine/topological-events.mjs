/**
 * Topological event surfaces — skeleton log on the Engine graph.
 *
 * Proto already tags temporal BVH / event surfaces / persistent topology as
 * skeleton (one defect worldline). This log does not perform surgery and
 * must not mutate certified domain hashes.
 *
 * Status: **skeleton**
 */

export const TOPOLOGICAL_EVENT_STATUS = "skeleton";

export const EVENT_KINDS = Object.freeze([
  "identity",
  "birth",
  "death",
  "split",
  "merge",
]);

/**
 * Append a declared topological event. Does not rewrite certified buffers.
 */
export function recordTopologicalEvent(graph, spec) {
  const kind = spec.kind || "identity";
  if (!EVENT_KINDS.includes(kind)) {
    throw new Error(`unknown topological event kind: ${kind}`);
  }
  const event = {
    id: spec.id || `e${String(graph.events.length + 1).padStart(4, "0")}`,
    t: spec.t | 0,
    kind,
    status: TOPOLOGICAL_EVENT_STATUS,
    domainId: spec.domainId ?? null,
    nodeIds: Array.isArray(spec.nodeIds) ? [...spec.nodeIds] : [],
    note: spec.note || "declared event surface; no topology surgery in v0.1",
  };
  graph.events.push(event);
  return event;
}
