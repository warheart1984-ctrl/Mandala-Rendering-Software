/**
 * TopologyValidator — refinement-time topology preservation checks.
 *
 * Every refinement operation must pass a topology-preservation check:
 *   T(parent) == T(child)
 * enforced as class preservation (+ level monotonicity). A topology change
 * is only permitted when config.allowTopologyChange is explicitly true.
 *
 * Status: enforced (verified by topology + failure tests).
 */

import { topologyClassOf, recomputeTopologySignature } from "./TopologySignature.js";
import { topologyEquivalent } from "./TopologyEquivalence.js";

export function validateRefinement(parent, children, config) {
  const violations = [];
  const parentClass = topologyClassOf(parent);

  for (const child of children) {
    if (child.level !== parent.level + 1) {
      violations.push(
        `child ${child.id} level ${child.level} != parent.level + 1 (${parent.level + 1})`,
      );
    }
    const childClass = topologyClassOf(child);
    if (childClass !== parentClass) {
      if (config && config.allowTopologyChange === true) {
        // Explicitly authorized topology-changing operation.
        continue;
      }
      violations.push(
        `child ${child.id} topology class ${childClass} != parent class ${parentClass} (unauthorized topological change)`,
      );
    }
    const eq = topologyEquivalent(parent, child);
    if (!eq.ok && !(config && config.allowTopologyChange === true)) {
      violations.push(`child ${child.id}: ${eq.reason}`);
    }
    const recomputed = recomputeTopologySignature(child);
    if (recomputed !== child.topologySignature.combinatorial) {
      violations.push(`child ${child.id}: topology signature not re-computable (tamper)`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    parentClass,
    childClasses: children.map((c) => topologyClassOf(c)),
    authorizedTopologyChange: config && config.allowTopologyChange === true,
  };
}

export function validateGlobalTopology(manifold, config) {
  const violations = [];
  const target = config ? config.topologyTarget : "S3";
  if (manifold.topologySignature && manifold.topologySignature.class !== target) {
    violations.push(
      `assembled manifold class ${manifold.topologySignature.class} != target ${target}`,
    );
  }
  if (!manifold.charts || manifold.charts.length === 0) {
    violations.push("assembled manifold has no charts");
  }
  if (manifold.charts && manifold.charts.length > 0) {
    const classes = new Set(manifold.charts.map((c) => c.topologyClass || target));
    if (classes.size !== 1) {
      violations.push(`chart topology classes inconsistent: ${[...classes].join(", ")}`);
    }
    if (!manifold.adjacencyGraph || manifold.adjacencyGraph.components !== 1) {
      violations.push("assembled manifold adjacency graph is disconnected");
    }
  }
  return { ok: violations.length === 0, violations };
}