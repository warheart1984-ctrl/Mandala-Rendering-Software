/**
 * TransitionMap — coordinate change between overlapping charts.
 *
 * Both charts embed into R4 (world space); the transition map is the
 * composition:
 *   A-coords → world (embed_A) → B-coords (toChartCoordinates_B)
 * Each map is sampled deterministically and verified to be a local
 * diffeomorphism (Jacobian determinant > 0) at every sample point.
 *
 * Status: enforced (verified by continuum tests).
 */

export const TRANSITION_EPS = 1e-3;

export function sampleChartDomain(chart, resolution) {
  const r = Math.max(1, resolution | 0);
  const step = (2 * chart.domainRadius) / r;
  const points = [];
  for (let i = 0; i <= r; i++) {
    for (let j = 0; j <= r; j++) {
      for (let k = 0; k <= r; k++) {
        points.push([
          -chart.domainRadius + i * step,
          -chart.domainRadius + j * step,
          -chart.domainRadius + k * step,
        ]);
      }
    }
  }
  return points;
}

export function createTransitionMap(chartA, chartB, resolution = 3) {
  const domain = sampleChartDomain(chartA, resolution);
  const samples = [];
  let jacobianDetMin = Infinity;
  for (const xiA of domain) {
    const world = chartA.embed(xiA);
    const xiB = chartB.toChartCoordinates(world);
    const jac = jacobianDet(chartA, chartB, xiA);
    jacobianDetMin = Math.min(jacobianDetMin, jac);
    samples.push({ xiA, xiB, jacobianDet: jac });
  }

  const aToB = (xiA) => chartB.toChartCoordinates(chartA.embed(xiA));

  return Object.freeze({
    aId: chartA.leafId,
    bId: chartB.leafId,
    samples,
    aToB,
    jacobianDetMin,
    diffeomorphism: jacobianDetMin > 0,
  });
}

/** Numerical Jacobian determinant of A→B at xiA (3×3). */
export function jacobianDet(chartA, chartB, xiA, h = TRANSITION_EPS) {
  const f = (xi) => chartB.toChartCoordinates(chartA.embed(xi));
  const J = [];
  for (let i = 0; i < 3; i++) {
    const xp = [...xiA];
    const xm = [...xiA];
    xp[i] += h;
    xm[i] -= h;
    const fp = f(xp);
    const fm = f(xm);
    J.push(fp.map((v, j) => (v - fm[j]) / (2 * h)));
  }
  const det =
    J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) -
    J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) +
    J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  return det;
}