/**
 * Manifold — the emergent global continuum Σ.
 *
 * Σ = Assemble(leaves): leaf charts + adjacency + transition maps, sampled
 * into a welded world-space mesh (vertices on S³ ⊂ R4, grid edges). The
 * manifold representation is independent of any renderer.
 *
 * Status: enforced (verified by continuum tests).
 */

import { hashState } from "../determinism/StateHasher.js";

export function createManifold({ charts, adjacency, components, transitionMaps, mesh }) {
  const leafIds = charts.map((c) => c.leafId).sort();
  const combinatorial = hashState({
    kind: "manifold.v1",
    class: "S3",
    charts: leafIds,
    vertices: mesh ? mesh.vertices.length : 0,
    edges: mesh ? mesh.edges.length : 0,
  }).slice(0, 16);

  return Object.freeze({
    topologySignature: Object.freeze({ class: "S3", combinatorial }),
    charts: Object.freeze(charts),
    adjacencyGraph: Object.freeze({
      vertices: leafIds,
      edges: Object.freeze(adjacency),
      components,
    }),
    transitionMaps: Object.freeze(transitionMaps),
    mesh: mesh ? Object.freeze(mesh) : null,
  });
}

export function manifoldSummary(manifold) {
  return {
    topologyClass: manifold.topologySignature.class,
    charts: manifold.charts.length,
    components: manifold.adjacencyGraph.components,
    transitionMaps: manifold.transitionMaps.length,
    vertices: manifold.mesh ? manifold.mesh.vertices.length : 0,
    edges: manifold.mesh ? manifold.mesh.edges.length : 0,
  };
}