/**
 * ChartAdjacency — overlap detection between leaf charts.
 *
 * Two charts are adjacent when their angular separation is less than the sum
 * of their angular radii (they genuinely overlap). Connectivity is therefore
 * emergent from local geometry, not prescribed.
 *
 * Status: enforced (verified by continuum tests).
 */

import { angularSeparation } from "../branching/AssociationOperator.js";

export const ADJACENCY_EPS = 1e-6;

export function chartsAdjacent(chartA, chartB) {
  const sep = angularSeparation(chartA.direction, chartB.direction);
  const overlap = chartA.angularRadius + chartB.angularRadius;
  return {
    adjacent: sep < overlap - ADJACENCY_EPS,
    separation: sep,
    overlap,
  };
}

export function buildAdjacency(leaves) {
  const adj = new Map(); // leafId -> [{leafId, separation}]
  for (const leaf of leaves) adj.set(leaf.id, []);

  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const b = leaves[j];
      const { adjacent, separation, overlap } = chartsAdjacent(a.geometry.chart, b.geometry.chart);
      if (adjacent) {
        adj.get(a.id).push({ leafId: b.id, separation, overlap });
        adj.get(b.id).push({ leafId: a.id, separation, overlap });
      }
    }
  }
  return adj;
}

/** Connected components of the adjacency graph via BFS. */
export function adjacencyComponents(adj) {
  const visited = new Set();
  const components = [];
  for (const root of adj.keys()) {
    if (visited.has(root)) continue;
    const comp = [];
    const queue = [root];
    visited.add(root);
    while (queue.length > 0) {
      const id = queue.shift();
      comp.push(id);
      for (const n of adj.get(id) || []) {
        if (!visited.has(n.leafId)) {
          visited.add(n.leafId);
          queue.push(n.leafId);
        }
      }
    }
    components.push(comp);
  }
  return components;
}