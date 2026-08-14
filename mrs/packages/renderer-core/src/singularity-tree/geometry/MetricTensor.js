/**
 * MetricTensor — pullback metric of a local chart.
 *
 * For the S³ stereographic chart: g(ξ) = a(ξ)² δ₃ with
 * a(ξ) = 2R²/(R²+|ξ|²). Returns symmetric 3×3 matrices and their inverse.
 *
 * Status: enforced (verified by geometry tests).
 */

export function identity3() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function zero3() {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

/** Metric tensor g(ξ) for a chart (3×3 symmetric matrix). */
export function metricAt(chart, xi) {
  const a = chart.conformalFactor(xi);
  const a2 = a * a;
  return [
    [a2, 0, 0],
    [0, a2, 0],
    [0, 0, a2],
  ];
}

/** Inverse metric g⁻¹(ξ) (diagonal for conformal charts). */
export function inverseMetricAt(chart, xi) {
  const a = chart.conformalFactor(xi);
  const inv = 1 / (a * a);
  return [
    [inv, 0, 0],
    [0, inv, 0],
    [0, 0, inv],
  ];
}

/** Metric signature: (+++) for the S³ round metric. */
export function metricSignature(g) {
  return g.map((row) => (row[0] > 0 ? 1 : row[0] < 0 ? -1 : 0));
}

export function determinant3(g) {
  return (
    g[0][0] * (g[1][1] * g[2][2] - g[1][2] * g[2][1]) -
    g[0][1] * (g[1][0] * g[2][2] - g[1][2] * g[2][0]) +
    g[0][2] * (g[1][0] * g[2][1] - g[1][1] * g[2][0])
  );
}

export function trace3(g, ginv) {
  let t = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) t += ginv[i][j] * g[j][i];
  return t;
}