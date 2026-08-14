/**
 * ContinuumAssembler — Σ = Assemble(leaves).
 *
 * Pipeline:
 *   collect terminal leaf charts
 *   establish overlaps (adjacency)
 *   validate adjacency
 *   construct global connectivity
 *   reconcile local coordinate systems (transition maps)
 *   verify topology
 *   generate global manifold representation (sampled, welded mesh)
 *
 * The assembler operates independently of the rendering system; rendering is
 * a consumer of the manifold.
 *
 * Status: enforced (verified by continuum tests).
 */

import { buildAdjacency, adjacencyComponents } from "./ChartAdjacency.js";
import { createTransitionMap, sampleChartDomain } from "./TransitionMap.js";
import { createManifold } from "./Manifold.js";
import { validateGlobalTopology } from "../topology/TopologyValidator.js";

const WELD_CELL = 1e-3;

function quantize(v, cell) {
  return [
    Math.round(v.x / cell),
    Math.round(v.y / cell),
    Math.round(v.z / cell),
    Math.round(v.w / cell),
  ].join(",");
}

/** Sample + weld chart grids into a single world-space mesh. */
export function sampleManifoldMesh(charts, resolution, weldDistance = WELD_CELL) {
  const cell = Math.max(weldDistance, 1e-9);
  const vertices = [];
  const vertexIds = []; // per chart: list of vertex indices (grid order)
  const weld = new Map();

  const chartInfo = charts.map((c) => {
    const domain = sampleChartDomain(c.chart, resolution);
    const ids = [];
    const n = resolution + 1;
    for (const xi of domain) {
      const p = c.chart.embed(xi);
      const key = quantize(p, cell);
      let id = weld.get(key);
      if (id === undefined) {
        id = vertices.length;
        vertices.push({ x: p.x, y: p.y, z: p.z, w: p.w });
        weld.set(key, id);
      }
      ids.push(id);
    }
    return { chart: c, ids, n };
  });

  const edges = [];
  const seen = new Set();
  for (const info of chartInfo) {
    const { ids, n } = info;
    const n2 = n * n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const ix = i * n2 + j * n + k;
          const pairs = [];
          if (k < n - 1) pairs.push([ix, ix + 1]);
          if (j < n - 1) pairs.push([ix, ix + n]);
          if (i < n - 1) pairs.push([ix, ix + n2]);
          for (const [a, b] of pairs) {
            if (ids[a] === ids[b]) continue;
            const key = ids[a] < ids[b] ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`;
            if (!seen.has(key)) {
              seen.add(key);
              edges.push([ids[a], ids[b]]);
            }
          }
        }
      }
    }
  }

  return { vertices, edges };
}

export function assembleContinuum(hierarchy, config) {
  const leaves = hierarchy.leaves();
  const withGeometry = leaves.filter((leaf) => leaf.geometry);

  const charts = withGeometry.map((leaf) => ({
    leafId: leaf.id,
    leaf,
    topologyClass: config.topologyTarget,
    chart: leaf.geometry.chart,
  }));

  const adj = buildAdjacency(withGeometry);
  const adjacency = [];
  for (const [leafId, neighbors] of adj) {
    for (const n of neighbors) {
      adjacency.push({ a: leafId, b: n.leafId, separation: n.separation });
    }
  }

  const components = adjacencyComponents(adj);

  const transitionMaps = [];
  const seenPairs = new Set();
  for (const [leafId, neighbors] of adj) {
    for (const n of neighbors) {
      const key = leafId < n.leafId ? `${leafId}|${n.leafId}` : `${n.leafId}|${leafId}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const chartA = charts.find((c) => c.leafId === leafId);
      const chartB = charts.find((c) => c.leafId === n.leafId);
      transitionMaps.push(
        createTransitionMap(chartA.chart, chartB.chart, config.transitionMapResolution || 2),
      );
    }
  }

  let mesh = null;
  if (config.enableGeometryGeneration) {
    mesh = sampleManifoldMesh(charts, config.leafSampleResolution, config.weldDistance);
  }

  const manifold = createManifold({
    charts,
    adjacency,
    components: components.length,
    transitionMaps,
    mesh,
  });

  const topo = validateGlobalTopology(manifold, config);
  if (!topo.ok) {
    throw new Error(`ContinuumAssembler: global topology violation: ${topo.violations.join("; ")}`);
  }

  return manifold;
}

export const CONTINUUM_ASSEMBLER_ID = "continuum.assembler.v1";