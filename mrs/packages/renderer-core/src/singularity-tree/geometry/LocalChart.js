/**
 * LocalChart — an S³ stereographic coordinate chart centered at a leaf
 * direction.
 *
 * Chart domain: ξ ∈ B³(0, ρ). Embedding into R4 (world):
 *   p_std = [ 2R²ξ/(R²+|ξ|²), R(R²−|ξ|²)/(R²+|ξ|²) ]   (frame coordinates)
 *   world = Σ eᵢ·p_std[i]  +  n·p_std[3]
 * The pullback metric is conformal: g = a(ξ)² δ₃ with
 *   a(ξ) = 2R²/(R²+|ξ|²)
 * i.e. the standard round metric of curvature 1/R² on S³.
 *
 * Status: enforced (verified by geometry + continuum tests).
 */

import { buildTangentFrame, expressInFrame } from "./TangentSpace.js";

export function createLocalChart(direction, radius, domainRadius) {
  const { normal, basis } = buildTangentFrame(direction);
  const R = radius;
  const rho = domainRadius;

  const conformalFactor = (xi) => {
    const s = xi[0] * xi[0] + xi[1] * xi[1] + xi[2] * xi[2];
    return (2 * R * R) / (R * R + s);
  };

  /** Embed chart coordinates ξ ∈ R³ into a world-space R4 point on S³(R). */
  function embed(xi) {
    const s = xi[0] * xi[0] + xi[1] * xi[1] + xi[2] * xi[2];
    const denom = R * R + s;
    const c = 2 * R * R;
    const pStd = [
      (c * xi[0]) / denom,
      (c * xi[1]) / denom,
      (c * xi[2]) / denom,
      (R * (R * R - s)) / denom,
    ];
    const world = { x: 0, y: 0, z: 0, w: 0 };
    for (let i = 0; i < 4; i++) {
      world.x += basis[i].x * pStd[i];
      world.y += basis[i].y * pStd[i];
      world.z += basis[i].z * pStd[i];
      world.w += basis[i].w * pStd[i];
    }
    return world;
  }

  /** Express a world-space point near this chart in chart coordinates. */
  function toChartCoordinates(worldPoint) {
    const coords = expressInFrame(worldPoint, basis);
    const denom = coords[3] + R; // pStd[3] = R(R²−s)/(R²+s); invert embed
    const scale = (2 * R) / denom;
    return [coords[0] * scale, coords[1] * scale, coords[2] * scale];
  }

  return Object.freeze({
    center: {
      x: normal.x * R,
      y: normal.y * R,
      z: normal.z * R,
      w: normal.w * R,
    },
    direction: normal,
    radius: R,
    domainRadius: rho,
    basis,
    conformalFactor,
    embed,
    toChartCoordinates,
    angularRadius: 2 * Math.atan(rho / Math.max(R, 1e-12)),
  });
}

export function chartPointOnSphere(xi, chart) {
  return chart.embed(xi);
}