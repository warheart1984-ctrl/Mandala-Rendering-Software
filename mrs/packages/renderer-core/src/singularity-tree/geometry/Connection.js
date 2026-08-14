/**
 * Connection — Christoffel symbols for the chart metric.
 *
 * Γ^k_ij = ½ g^{kl} (∂_i g_{lj} + ∂_j g_{li} − ∂_l g_{ij})
 *
 * Computed numerically (central differences) from the chart metric function
 * so the same code works for any chart metric. Deterministic.
 *
 * Status: enforced (verified by geometry tests).
 */

import { metricAt, inverseMetricAt, zero3 } from "./MetricTensor.js";

export const CONNECTION_EPS = 1e-4;

/** Central difference of the metric with respect to coordinate m. */
export function metricDerivative(chart, xi, m, h = CONNECTION_EPS) {
  const xp = [...xi];
  const xm = [...xi];
  xp[m] += h;
  xm[m] -= h;
  const gp = metricAt(chart, xp);
  const gm = metricAt(chart, xm);
  const d = zero3();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) d[i][j] = (gp[i][j] - gm[i][j]) / (2 * h);
  return d;
}

/**
 * Christoffel symbols Γ^k_ij at ξ.
 * @returns {number[][][]} G[k][i][j] = Γ^k_ij
 */
export function christoffel(chart, xi, h = CONNECTION_EPS) {
  const g = metricAt(chart, xi);
  const ginv = inverseMetricAt(chart, xi);
  const dg = [0, 1, 2].map((m) => metricDerivative(chart, xi, m, h));

  const G = [];
  for (let k = 0; k < 3; k++) {
    G.push(zero3());
  }
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let l = 0; l < 3; l++) {
          sum += ginv[k][l] * (dg[i][l][j] + dg[j][l][i] - dg[l][i][j]);
        }
        G[k][i][j] = 0.5 * sum;
      }
    }
  }
  return G;
}

/** Derivative of Christoffel symbols with respect to coordinate m. */
export function christoffelDerivative(chart, xi, m, h = CONNECTION_EPS) {
  const xp = [...xi];
  const xm = [...xi];
  xp[m] += h;
  xm[m] -= h;
  const Gp = christoffel(chart, xp, h);
  const Gm = christoffel(chart, xm, h);
  const dG = [];
  for (let k = 0; k < 3; k++) {
    dG.push(zero3());
  }
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        dG[k][i][j] = (Gp[k][i][j] - Gm[k][i][j]) / (2 * h);
  return dG;
}