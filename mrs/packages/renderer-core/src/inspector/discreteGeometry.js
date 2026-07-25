/**
 * Discrete differential geometry on triangle meshes (CPU).
 * Status: tested — Gaussian angle defect, uniform Laplace-Beltrami mean,
 * principal k1/k2 from (K,H) quadratic; not GPU curvature.
 *
 * Conventions:
 *   K_defect(v) = 2π − Σ face angles at v  (integrated Gaussian)
 *   K(v)        = K_defect / A_bary        (density used for principal roots)
 *   L(v)        = (1/deg) Σ (u − v)        (uniform Laplacian)
 *   H_raw(v)    = ‖L(v)‖ / 2               (meanCurvatureScalar — unnormalized)
 *   H(v)        = ‖L(v)‖ / (2 A_bary)      (density used for principal roots)
 *   k1,k2       = H ± √(H² − K)            (when H² ≥ K)
 */

import { vec4 } from "./types.js";

function asVec4(v) {
  if (!v) return vec4();
  if (Array.isArray(v)) return vec4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
  return vec4(v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0);
}

function sub4(a, b) {
  return vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
}

function add4(a, b) {
  return vec4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
}

function scale4(v, s) {
  return vec4(v.x * s, v.y * s, v.z * s, v.w * s);
}

function dot4(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function len4(v) {
  return Math.sqrt(dot4(v, v));
}

function edgeKey(i, j) {
  return i < j ? `${i}|${j}` : `${j}|${i}`;
}

/**
 * @param {{ vertices: any[], faces: number[][] }} mesh
 * @returns {{
 *   edgeFaces: Map<string, number[]>,
 *   vertexFaces: number[][],
 *   vertexVertices: number[][],
 *   edges: string[],
 * }}
 */
export function buildEdgeAdjacency(mesh) {
  const faces = mesh?.faces ?? [];
  const nV = mesh?.vertices?.length ?? 0;
  const edgeFaces = new Map();
  const vertexFaces = Array.from({ length: nV }, () => []);
  const neighborSets = Array.from({ length: nV }, () => new Set());

  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    if (!f || f.length < 3) continue;
    const a = f[0], b = f[1], c = f[2];
    for (const vi of [a, b, c]) {
      if (vi >= 0 && vi < nV) vertexFaces[vi].push(fi);
    }
    const triples = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [i, j] of triples) {
      const key = edgeKey(i, j);
      let list = edgeFaces.get(key);
      if (!list) {
        list = [];
        edgeFaces.set(key, list);
      }
      list.push(fi);
      if (i >= 0 && i < nV) neighborSets[i].add(j);
      if (j >= 0 && j < nV) neighborSets[j].add(i);
    }
  }

  return {
    edgeFaces,
    vertexFaces,
    vertexVertices: neighborSets.map((s) => [...s]),
    edges: [...edgeFaces.keys()],
  };
}

/** Interior angle at vertex `vi` within triangle (v0,v1,v2), using XYZ+W Euclidean metric. */
export function triangleAngleAt(vCorner, vA, vB) {
  const e1 = sub4(vA, vCorner);
  const e2 = sub4(vB, vCorner);
  const l1 = len4(e1);
  const l2 = len4(e2);
  if (l1 < 1e-15 || l2 < 1e-15) return 0;
  const c = Math.max(-1, Math.min(1, dot4(e1, e2) / (l1 * l2)));
  return Math.acos(c);
}

/** Triangle area from cross of edges (spatial 3D cross magnitude / 2; w ignored for area). */
export function triangleArea(v0, v1, v2) {
  const e1 = sub4(v1, v0);
  const e2 = sub4(v2, v0);
  const cx = e1.y * e2.z - e1.z * e2.y;
  const cy = e1.z * e2.x - e1.x * e2.z;
  const cz = e1.x * e2.y - e1.y * e2.x;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

/**
 * Gaussian curvature at vertex as angle defect: K = 2π − Σ angles.
 * Boundary vertices use π − Σ (open fan).
 */
export function gaussianCurvature(mesh, vertexIndex, adjacency = null) {
  const adj = adjacency ?? buildEdgeAdjacency(mesh);
  const faces = mesh.faces;
  const verts = mesh.vertices;
  const incident = adj.vertexFaces[vertexIndex] ?? [];
  if (incident.length === 0) return 0;

  let angleSum = 0;
  let boundaryEdges = 0;
  for (const fi of incident) {
    const f = faces[fi];
    const [a, b, c] = f;
    const v0 = asVec4(verts[a]);
    const v1 = asVec4(verts[b]);
    const v2 = asVec4(verts[c]);
    if (vertexIndex === a) angleSum += triangleAngleAt(v0, v1, v2);
    else if (vertexIndex === b) angleSum += triangleAngleAt(v1, v2, v0);
    else if (vertexIndex === c) angleSum += triangleAngleAt(v2, v0, v1);
  }

  for (const n of adj.vertexVertices[vertexIndex] ?? []) {
    const key = edgeKey(vertexIndex, n);
    const ef = adj.edgeFaces.get(key) ?? [];
    if (ef.length < 2) boundaryEdges++;
  }

  const isBoundary = boundaryEdges > 0;
  return (isBoundary ? Math.PI : 2 * Math.PI) - angleSum;
}

/** Barycentric vertex area = (1/3) Σ incident triangle areas. */
export function barycentricVertexArea(mesh, vertexIndex, adjacency = null) {
  const adj = adjacency ?? buildEdgeAdjacency(mesh);
  const faces = mesh.faces;
  const verts = mesh.vertices;
  let area = 0;
  for (const fi of adj.vertexFaces[vertexIndex] ?? []) {
    const f = faces[fi];
    area += triangleArea(asVec4(verts[f[0]]), asVec4(verts[f[1]]), asVec4(verts[f[2]]));
  }
  return area / 3;
}

/** Uniform Laplace-Beltrami vector L(v) = (1/deg) Σ (u − v). */
export function meanCurvatureVector(mesh, vertexIndex, adjacency = null) {
  const adj = adjacency ?? buildEdgeAdjacency(mesh);
  const neighbors = adj.vertexVertices[vertexIndex] ?? [];
  const v = asVec4(mesh.vertices[vertexIndex]);
  if (neighbors.length === 0) return vec4();
  let acc = vec4();
  for (const ni of neighbors) {
    acc = add4(acc, sub4(asVec4(mesh.vertices[ni]), v));
  }
  return scale4(acc, 1 / neighbors.length);
}

/** H = ‖L(v)‖ / 2 */
export function meanCurvatureScalar(mesh, vertexIndex, adjacency = null) {
  return len4(meanCurvatureVector(mesh, vertexIndex, adjacency)) / 2;
}

/**
 * Principal curvatures from mean H and Gaussian K (densities):
 *   k1,k2 = H ± √(H² − K) when H² ≥ K
 *   else umbilic fallback sign(H)·√K (uniform LB often underestimates H vs angle-defect K)
 */
export function principalFromKH(K, H) {
  const disc = H * H - K;
  if (disc >= -1e-12) {
    const s = Math.sqrt(Math.max(0, disc));
    return { k1: H + s, k2: H - s, K, H };
  }
  const k = Math.sign(H || 1) * Math.sqrt(Math.max(0, K));
  return { k1: k, k2: k, K, H, inconsistentKH: true };
}

/**
 * Interpolate per-vertex scalars with barycentric weights {w,u,v} for face (i0,i1,i2).
 * Convention matches inspector Möller–Trumbore: w at v0, u at v1, v at v2.
 */
export function interpolateVertexScalar(values, i0, i1, i2, bary) {
  const w = bary?.w ?? bary?.[0] ?? 0;
  const u = bary?.u ?? bary?.[1] ?? 0;
  const v = bary?.v ?? bary?.[2] ?? 0;
  return (values[i0] ?? 0) * w + (values[i1] ?? 0) * u + (values[i2] ?? 0) * v;
}

/**
 * Full per-vertex discrete curvature field.
 * Principal roots use area-normalized Gaussian density so sphere k ≈ 1/r.
 *
 * @returns {{
 *   adjacency: object,
 *   K_defect: Float64Array,
 *   K: Float64Array,
 *   H: Float64Array,
 *   k1: Float64Array,
 *   k2: Float64Array,
 *   sampleAtFace: Function,
 * }}
 */
export function computeMeshCurvature(mesh) {
  const n = mesh?.vertices?.length ?? 0;
  const adjacency = buildEdgeAdjacency(mesh);
  const K_defect = new Float64Array(n);
  const K = new Float64Array(n);
  const H = new Float64Array(n);
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const defect = gaussianCurvature(mesh, i, adjacency);
    const area = Math.max(barycentricVertexArea(mesh, i, adjacency), 1e-15);
    const L = meanCurvatureVector(mesh, i, adjacency);
    // Area-normalized mean density so sphere principals ≈ 1/r (uniform LB).
    const hDens = len4(L) / (2 * area);
    const kDens = defect / area;
    const prin = principalFromKH(kDens, hDens);
    K_defect[i] = defect;
    K[i] = kDens;
    H[i] = hDens;
    k1[i] = prin.k1;
    k2[i] = prin.k2;
  }

  function sampleAtFace(faceIndex, bary) {
    const face = mesh.faces[faceIndex];
    if (!face) {
      return { k1: 0, k2: 0, K: 0, H: 0, curvatureStub: false, source: "discrete_cpu" };
    }
    const [i0, i1, i2] = face;
    return {
      k1: interpolateVertexScalar(k1, i0, i1, i2, bary),
      k2: interpolateVertexScalar(k2, i0, i1, i2, bary),
      K: interpolateVertexScalar(K, i0, i1, i2, bary),
      H: interpolateVertexScalar(H, i0, i1, i2, bary),
      curvatureStub: false,
      source: "discrete_cpu",
    };
  }

  return { adjacency, K_defect, K, H, k1, k2, sampleAtFace };
}
