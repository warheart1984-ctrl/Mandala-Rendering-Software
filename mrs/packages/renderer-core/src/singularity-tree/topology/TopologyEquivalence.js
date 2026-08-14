/**
 * TopologyEquivalence — distinguish geometric deformation from topological
 * change.
 *
 *   TopologyEquivalent(parent, child) == true
 *
 * Geometry may change (deformation allowed); topology class may not change
 * unless an explicit topology-changing operation is authorized
 * (config.allowTopologyChange). Combinatorial equivalence is a stronger,
 * exact structural check used for replay/audit.
 *
 * Status: enforced (verified by topology tests).
 */

import { topologyClassOf } from "./TopologySignature.js";

export function topologyEquivalent(a, b) {
  const classA = topologyClassOf(a);
  const classB = topologyClassOf(b);
  if (classA === null || classB === null) {
    return { ok: false, reason: "node has no topology class", deformationOnly: false };
  }
  if (classA !== classB) {
    return {
      ok: false,
      reason: `topological change: ${classA} -> ${classB}`,
      deformationOnly: false,
    };
  }
  const combA = a.topologySignature ? a.topologySignature.combinatorial : null;
  const combB = b.topologySignature ? b.topologySignature.combinatorial : null;
  const exact = combA !== null && combA === combB;
  return {
    ok: true,
    deformationOnly: !exact,
    reason: exact ? "topology identical" : "topology class preserved (geometric deformation)",
  };
}

export function isTopologyChangeOnly(a, b) {
  const eq = topologyEquivalent(a, b);
  return !eq.ok && !eq.deformationOnly;
}