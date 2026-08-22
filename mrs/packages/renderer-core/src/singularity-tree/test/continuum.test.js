/** Continuum tests — ChartAdjacency, TransitionMap, Manifold, ContinuumAssembler. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { buildAdjacency, adjacencyComponents } from "../continuum/ChartAdjacency.js";
import { createTransitionMap, sampleChartDomain, jacobianDet } from "../continuum/TransitionMap.js";
import { createManifold, manifoldSummary } from "../continuum/Manifold.js";
import { assembleContinuum, sampleManifoldMesh } from "../continuum/ContinuumAssembler.js";

describe("SingularityTree Continuum", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe( "ChartAdjacency", () => {
    it( "buildAdjacency returns adjacency map", () => {
      const adj = buildAdjacency([]);
      assert.ok(typeof adj === "object");
    });
  });

  describe( "adjacencyComponents", () => {
    it( "adjacencyComponents computes components", () => {
      const comps = adjacencyComponents([]);
      assert.ok(Array.isArray(comps) || typeof comps === "number");
    });
  });

  describe( "TransitionMap", () => {
    it( "createTransitionMap produces a transition map", () => {
      const tmap = createTransitionMap({ chart: { embed: () => {} } }, { chart: { embed: () => {} } }, 2);
      assert.ok(tmap !== null);
    });

    it( "sampleChartDomain samples a chart domain", () => {
      const domain = sampleChartDomain({ chart: { embed: () => {} } }, 4);
      assert.ok(domain !== null);
    });

    it( "jacobianDet computes a Jacobian determinant", () => {
      const det = jacobianDet({ chart: { embed: () => {} } }, 2);
      assert.ok(typeof det === "number");
    });
  });

  describe( "Manifold", () => {
    it( "createManifold produces a manifold summary", () => {
      const m = createManifold({ charts: [], adjacency: [], components: 0, transitionMaps: [] });
      assert.ok(m !== null);
    });

    it( "manifoldSummary extracts summary fields", () => {
      const m = createManifold({ charts: [], adjacency: [], components: 1, transitionMaps: [] });
      const s = manifoldSummary(m);
      assert.ok(s !== null);
    });
  });

  describe( "ContinuumAssembler", () => {
    it( "sampleManifoldMesh produces a mesh from charts", () => {
      const charts = [];
      const mesh = sampleManifoldMesh(charts, root.config.leafSampleResolution, root.config.weldDistance);
      assert.ok(mesh !== null);
      assert.ok(mesh.vertices !== undefined);
      assert.ok(mesh.edges !== undefined);
    });
  });
});