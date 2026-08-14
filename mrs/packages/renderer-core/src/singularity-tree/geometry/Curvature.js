/**
 * Curvature — Riemann tensor and Ricci scalar from the chart connection.
 *
 *   R^i_{jkl} = ∂_k Γ^i_{jl} − ∂_l Γ^i_{jk} + Γ^m_{jl}Γ^i_{mk} − Γ^m_{jk}Γ^i_{ml}
 *   R_jl      = R^i_{jil}
 *   R         = g^{jl} R_jl
 *
 * Fully numerical (central differences), deterministic, and convention-safe:
 * for an S³ chart of radius R the scalar curvature must equal 6/R².
 *
 * Status: enforced (verified by geometry tests).
 */

import { christoffel, christoffelDerivative } from "./Connection.js";
import { inverseMetricAt } from "./MetricTensor.js";

export function riemannTensor(chart, xi) {
  const G = christoffel(chart, xi);
  const dG = [0, 1, 2].map((m) => christoffelDerivative(chart, xi, m));
  const R = []; // R[i][j][k][l] = R^i_{jkl}
  for (let i = 0; i < 3; i++) {
    const layer = [];
    for (let j = 0; j < 3; j++) {
      const rows = [];
      for (let k = 0; k < 3; k++) rows.push([0, 0, 0]);
      layer.push(rows);
    }
    R.push(layer);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        for (let l = 0; l < 3; l++) {
          let sum = dG[k][i][j][l] - dG[l][i][j][k];
          for (let m = 0; m < 3; m++) {
            sum += G[m][j][l] * G[i][m][k] - G[m][j][k] * G[i][m][l];
          }
          R[i][j][k][l] = sum;
        }
      }
    }
  }
  return R;
}

export function ricciTensor(chart, xi) {
  const R = riemannTensor(chart, xi);
  const ric = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let j = 0; j < 3; j++) {
    for (let l = 0; l < 3; l++) {
      let sum = 0;
      for (let i = 0; i < 3; i++) sum += R[i][j][i][l];
      ric[j][l] = sum;
    }
  }
  return ric;
}

export function ricciScalar(chart, xi) {
  const ric = ricciTensor(chart, xi);
  const ginv = inverseMetricAt(chart, xi);
  let s = 0;
  for (let j = 0; j < 3; j++)
    for (let l = 0; l < 3; l++) s += ginv[j][l] * ric[j][l];
  return s;
}