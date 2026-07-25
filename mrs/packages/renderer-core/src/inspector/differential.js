import { vec4 } from "./types.js";
import {
  principalFromKH,
  computeMeshCurvature,
  interpolateVertexScalar,
} from "./discreteGeometry.js";

function sub(a, b) {
  return vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
}

function add(a, b) {
  return vec4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
}

function scale(v, s) {
  return vec4(v.x * s, v.y * s, v.z * s, v.w * s);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function length(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v) {
  const L = length(v) || 1;
  return scale(v, 1 / L);
}

/** Engineering 4D "cross" of two vectors into a normal-like direction via Gram complement. */
export function normalFromEdges(e1, e2) {
  // Prefer XYZ cross of spatial parts, keep w from e1×e2 mix.
  const nx = e1.y * e2.z - e1.z * e2.y;
  const ny = e1.z * e2.x - e1.x * e2.z;
  const nz = e1.x * e2.y - e1.y * e2.x;
  const nw = e1.x * e2.w - e1.w * e2.x + e1.y * e2.w - e1.w * e2.y;
  return normalize(vec4(nx, ny, nz, nw));
}

export function orthonormalTangentBasis(e1, e2, n) {
  let t1 = normalize(e1);
  // Remove normal component
  t1 = normalize(sub(t1, scale(n, dot(t1, n))));
  let t2 = sub(e2, scale(t1, dot(e2, t1)));
  t2 = sub(t2, scale(n, dot(t2, n)));
  if (length(t2) < 1e-8) {
    // Fallback axis orthogonal to n and t1
    const cand = Math.abs(n.x) < 0.9 ? vec4(1, 0, 0, 0) : vec4(0, 1, 0, 0);
    t2 = normalize(sub(cand, scale(t1, dot(cand, t1))));
    t2 = normalize(sub(t2, scale(n, dot(t2, n))));
  } else {
    t2 = normalize(t2);
  }
  return { t1, t2 };
}

export function jacobianFromEdges(e1, e2) {
  return [
    [e1.x, e2.x],
    [e1.y, e2.y],
    [e1.z, e2.z],
    [e1.w, e2.w],
  ];
}

/**
 * Stub principal curvatures — labeled skeleton when mesh topology is unavailable.
 * Status: tested (explicit stub path).
 */
export function principalCurvatureStub(t1, t2) {
  return {
    k1: 0,
    k2: 0,
    dir1: { ...t1 },
    dir2: { ...t2 },
    curvatureStub: true,
    source: "stub",
  };
}

/**
 * Real principal curvatures from discrete mesh (K,H) or precomputed k1/k2.
 * Status: tested — CPU discrete geometry only; not GPU curvature.
 *
 * @param {object} t1
 * @param {object} t2
 * @param {{ k1?: number, k2?: number, K?: number, H?: number, source?: string }} discrete
 */
export function principalCurvatureReal(t1, t2, discrete = {}) {
  let k1 = discrete.k1;
  let k2 = discrete.k2;
  if (!Number.isFinite(k1) || !Number.isFinite(k2)) {
    const prin = principalFromKH(discrete.K ?? 0, discrete.H ?? 0);
    k1 = prin.k1;
    k2 = prin.k2;
  }
  return {
    k1,
    k2,
    K: discrete.K,
    H: discrete.H,
    dir1: { ...t1 },
    dir2: { ...t2 },
    curvatureStub: false,
    source: discrete.source ?? "discrete_cpu",
  };
}

export function signedHyperplaneDistance(p, normal, d) {
  return dot(normal, p) + d;
}

export {
  sub,
  add,
  scale,
  dot,
  length,
  normalize,
  principalFromKH,
  computeMeshCurvature,
  interpolateVertexScalar,
};
