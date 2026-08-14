/**
 * GeometryFactory — L4: realizes local geometry from leaf nodes.
 *
 * Leaf → LocalChart → Metric → Connection → Curvature.
 * Geometry is emergent: it is produced here from the leaf's differentiation
 * state (direction + potential), never assumed at the root.
 *
 * Status: enforced (verified by geometry tests).
 */

import { createLocalChart } from "./LocalChart.js";
import { metricAt, inverseMetricAt } from "./MetricTensor.js";
import { christoffel } from "./Connection.js";
import { riemannTensor, ricciTensor, ricciScalar } from "./Curvature.js";
import { hashState } from "../determinism/StateHasher.js";

export const MIN_CHART_RADIUS = 1e-6;

export function generateLeafGeometry(node, config) {
  const potential = node.state.potential;
  const R = Math.max(potential * config.leafChartRadiusWorld, MIN_CHART_RADIUS);
  const rho = R * config.chartCoverage;

  const chart = createLocalChart(node.state.state, R, rho);
  const xi0 = [0, 0, 0];

  const metric = {
    at: (xi) => metricAt(chart, xi),
    inverseAt: (xi) => inverseMetricAt(chart, xi),
    atCenter: metricAt(chart, xi0),
    signature: "+++",
  };
  const connection = {
    christoffelAt: (xi) => christoffel(chart, xi),
    atCenter: christoffel(chart, xi0),
  };
  const curvature = {
    riemannAt: (xi) => riemannTensor(chart, xi),
    ricciAt: (xi) => ricciTensor(chart, xi),
    ricciScalarAt: (xi) => ricciScalar(chart, xi),
    atCenter: {
      riemann: riemannTensor(chart, xi0),
      ricci: ricciTensor(chart, xi0),
      scalar: ricciScalar(chart, xi0),
    },
  };

  const geometry = Object.freeze({
    chart,
    metric,
    connection,
    curvature,
    tangentSpace: { normal: chart.direction, basis: chart.basis },
    signature: hashState({
      kind: "geometry.leaf.v1",
      class: config.topologyTarget,
      center: chart.center,
      radius: R,
      domainRadius: rho,
      potential,
    }).slice(0, 16),
  });

  node.geometry = geometry;
  node.geometrySignature = geometry.signature;
  return geometry;
}

/** Generate leaf geometry for every leaf in the hierarchy. */
export function generateAllLeafGeometry(hierarchy, config) {
  const leaves = hierarchy.leaves();
  for (const leaf of leaves) {
    generateLeafGeometry(leaf, config);
  }
  return leaves.map((leaf) => leaf.geometry);
}