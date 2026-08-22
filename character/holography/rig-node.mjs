/**
 * RigNode entanglement tensors — local information wells on skin/rig verts.
 *
 *   E_i = Σ_{j ∈ N(i)} w_ij · d̂^{ij} ⊗ d̂^{ij}
 *
 * High ‖E‖ → strongly coupled; principal eigenvectors → fiber/flow directions.
 * Status: **partial** — synthetic informational layer, not quantum entanglement.
 */

import { createHash } from "node:crypto";

export const RIG_NODE_STATUS = "partial";
export const RIG_NODE_CLAIM =
  "Local entanglement tensor on rig/skin nodes — informational coupling proxy, not constitutional holographic organism";

/** Zero 3×3 (row-major Float64Array length 9). */
export function mat3Zero() {
  return new Float64Array(9);
}

/** Identity 3×3. */
export function mat3Identity() {
  const M = mat3Zero();
  M[0] = 1;
  M[4] = 1;
  M[8] = 1;
  return M;
}

/** M += s · (u ⊗ u) for unit-ish vector u. */
export function mat3AddOuter(M, ux, uy, uz, s) {
  M[0] += s * ux * ux;
  M[1] += s * ux * uy;
  M[2] += s * ux * uz;
  M[3] += s * uy * ux;
  M[4] += s * uy * uy;
  M[5] += s * uy * uz;
  M[6] += s * uz * ux;
  M[7] += s * uz * uy;
  M[8] += s * uz * uz;
  return M;
}

/** Frobenius norm ‖M‖_F. */
export function mat3Frobenius(M) {
  let s = 0;
  for (let i = 0; i < 9; i++) s += M[i] * M[i];
  return Math.sqrt(s);
}

/** Symmetry residual max |M_ij − M_ji|. */
export function mat3SymmetryResidual(M) {
  return Math.max(
    Math.abs(M[1] - M[3]),
    Math.abs(M[2] - M[6]),
    Math.abs(M[5] - M[7]),
  );
}

/**
 * Soft PSD check: power-iteration smallest Rayleigh quotient ≥ −tol.
 * Exact eigenvalues optional; this is enough for outer-sum tensors.
 */
export function mat3IsPsdIsh(M, tol = 1e-9) {
  // Symmetrize for check
  const S = new Float64Array(9);
  S[0] = M[0];
  S[4] = M[4];
  S[8] = M[8];
  S[1] = S[3] = 0.5 * (M[1] + M[3]);
  S[2] = S[6] = 0.5 * (M[2] + M[6]);
  S[5] = S[7] = 0.5 * (M[5] + M[7]);

  // Trace ≥ 0 and all principal minors soft-ok (Sylvester for SPD-ish)
  const a = S[0];
  const b = S[1];
  const c = S[2];
  const d = S[4];
  const e = S[5];
  const f = S[8];
  const det2 = a * d - b * b;
  const det3 =
    a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
  return a >= -tol && det2 >= -tol && det3 >= -tol;
}

/**
 * Dominant eigenvector via power iteration (fiber / flow direction).
 * @returns {{ v: number[], lambda: number }}
 */
export function mat3PrincipalDirection(M, iters = 24) {
  let x = 1;
  let y = 0.3;
  let z = 0.1;
  let lambda = 0;
  for (let k = 0; k < iters; k++) {
    const nx = M[0] * x + M[1] * y + M[2] * z;
    const ny = M[3] * x + M[4] * y + M[5] * z;
    const nz = M[6] * x + M[7] * y + M[8] * z;
    const L = Math.hypot(nx, ny, nz) || 1e-12;
    x = nx / L;
    y = ny / L;
    z = nz / L;
    lambda = L;
  }
  // Rayleigh quotient
  const Mx = M[0] * x + M[1] * y + M[2] * z;
  const My = M[3] * x + M[4] * y + M[5] * z;
  const Mz = M[6] * x + M[7] * y + M[8] * z;
  lambda = Mx * x + My * y + Mz * z;
  return { v: [x, y, z], lambda };
}

function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

function estimateNodeFrames(egt) {
  const n = egt.nodes.length;
  const normals = Array.from({ length: n }, () => [0, 0, 1]);
  const tangents = Array.from({ length: n }, () => [1, 0, 0]);
  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push(e.j);
    adj[e.j].push(e.i);
  }
  for (let i = 0; i < n; i++) {
    const p = posArr(egt.nodes[i].position);
    const neigh = adj[i];
    if (!neigh.length) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const j of neigh) {
      const q = posArr(egt.nodes[j].position);
      cx += q[0];
      cy += q[1];
      cz += q[2];
    }
    cx /= neigh.length;
    cy /= neigh.length;
    cz /= neigh.length;
    const nx = p[0] - cx;
    const ny = p[1] - cy;
    const nz = p[2] - cz;
    const nL = Math.hypot(nx, ny, nz) || 1;
    normals[i] = [nx / nL, ny / nL, nz / nL];
    // Tangent ≈ first edge projected off normal
    const q0 = posArr(egt.nodes[neigh[0]].position);
    let tx = q0[0] - p[0];
    let ty = q0[1] - p[1];
    let tz = q0[2] - p[2];
    const nd = tx * normals[i][0] + ty * normals[i][1] + tz * normals[i][2];
    tx -= nd * normals[i][0];
    ty -= nd * normals[i][1];
    tz -= nd * normals[i][2];
    const tL = Math.hypot(tx, ty, tz) || 1;
    tangents[i] = [tx / tL, ty / tL, tz / tL];
  }
  return { normals, tangents };
}

/**
 * Compute per-node entanglement tensors from EGT edges.
 * E_i = Σ_j w_ij · d̂^{ij} ⊗ d̂^{ij}
 *
 * @param {object} egt — skin/body EGT with nodes + edges
 * @returns {{ E: Float64Array[], norms: Float64Array, principals: {v:number[],lambda:number}[] }}
 */
export function computeEntanglementTensors(egt) {
  const n = egt.nodes.length;
  const E = Array.from({ length: n }, () => mat3Zero());
  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push({ j: e.j, w: e.w_ij });
    adj[e.j].push({ j: e.i, w: e.w_ij });
  }

  for (let i = 0; i < n; i++) {
    const pi = posArr(egt.nodes[i].position);
    for (const { j, w } of adj[i]) {
      const pj = posArr(egt.nodes[j].position);
      let dx = pj[0] - pi[0];
      let dy = pj[1] - pi[1];
      let dz = pj[2] - pi[2];
      const L = Math.hypot(dx, dy, dz) || 1e-12;
      dx /= L;
      dy /= L;
      dz /= L;
      mat3AddOuter(E[i], dx, dy, dz, w);
    }
  }

  const norms = new Float64Array(n);
  const principals = new Array(n);
  for (let i = 0; i < n; i++) {
    norms[i] = mat3Frobenius(E[i]);
    principals[i] = mat3PrincipalDirection(E[i]);
  }
  return { E, norms, principals };
}

/**
 * Default GovernanceCoord (0..1) — soft CIEMS audit fields.
 * @returns {{ intent: number, evidence: number, conformance: number, stewardship: number }}
 */
export function defaultGovernanceCoord(partial = {}) {
  return {
    intent: clamp01(partial.intent ?? 0.5),
    evidence: clamp01(partial.evidence ?? 0.5),
    conformance: clamp01(partial.conformance ?? 0.5),
    stewardship: clamp01(partial.stewardship ?? 0.5),
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

/**
 * Build RigNode[] from an existing skin/body EGT (enrich in place or return).
 *
 * RigNode {
 *   pos, normal, tangent,
 *   layerSkin, layerMuscle, layerBone,
 *   E: Mat3, rho, gov: GovernanceCoord
 * }
 *
 * @param {object} egt
 * @param {{ mutate?: boolean, gov?: object|((i:number,node:object)=>object) }} [opts]
 */
export function buildRigNodes(egt, opts = {}) {
  const n = egt.nodes.length;
  const { E, norms, principals } = computeEntanglementTensors(egt);
  const { normals, tangents } = estimateNodeFrames(egt);
  const layers = egt.layers || null;

  const nodes = new Array(n);
  for (let i = 0; i < n; i++) {
    const src = egt.nodes[i];
    const pos = posArr(src.position);
    const layerSkin = layers?.skin?.[i] ?? src.layers?.skin ?? 0.5;
    const layerMuscle = layers?.muscle?.[i] ?? src.layers?.muscle ?? 0.3;
    const layerBone = layers?.bone?.[i] ?? src.layers?.bone ?? 0.2;

    let govPartial = opts.gov;
    if (typeof opts.gov === "function") {
      govPartial = opts.gov(i, src);
    } else if (src.gov) {
      govPartial = { ...src.gov, ...opts.gov };
    }

    // Soft defaults from local coupling strength + curvature proxy
    const eNorm = norms[i];
    const kAbs = Math.abs(egt.K?.[i] || 0);
    const rho = egt.rho?.[i] ?? src.rho ?? 0;
    const gov = defaultGovernanceCoord({
      intent: 0.4 + 0.4 * Math.min(1, eNorm / (1 + eNorm)),
      evidence: 0.35 + 0.5 * Math.min(1, rho),
      conformance: 0.5 + 0.3 * Math.min(1, kAbs / (1 + kAbs)),
      stewardship: 0.45 + 0.35 * Math.min(1, layerMuscle),
      ...govPartial,
    });

    const rig = {
      id: i,
      pos: { x: pos[0], y: pos[1], z: pos[2] },
      normal: normals[i],
      tangent: tangents[i],
      layerSkin,
      layerMuscle,
      layerBone,
      E: E[i],
      E_norm: eNorm,
      principal: principals[i],
      rho,
      gov,
    };
    nodes[i] = rig;

    if (opts.mutate !== false) {
      src.E = E[i];
      src.E_norm = eNorm;
      src.principal = principals[i];
      src.normal = normals[i];
      src.tangent = tangents[i];
      src.layerSkin = layerSkin;
      src.layerMuscle = layerMuscle;
      src.layerBone = layerBone;
      src.gov = gov;
      if (!src.layers) {
        src.layers = { skin: layerSkin, muscle: layerMuscle, bone: layerBone };
      }
    }
  }

  egt.rigNodes = nodes;
  egt.E_norms = norms;
  egt.rigNodeStatus = RIG_NODE_STATUS;
  egt.rigNodeClaim = RIG_NODE_CLAIM;
  return nodes;
}

/**
 * Attach RigNodes + store aggregate |E| on egt for heatmaps (ρ slot clone).
 */
export function enrichSkinEgtWithRigNodes(egt, opts = {}) {
  const nodes = buildRigNodes(egt, { ...opts, mutate: true });
  egt.kind = egt.kind || "skin-entanglement-graph-tensor";
  return { egt, rigNodes: nodes };
}

export function hashRigNodes(nodes) {
  const h = createHash("sha256");
  h.update("character.holography.rig-node.v1");
  h.update(String(nodes.length));
  for (const n of nodes) {
    h.update(`${n.E_norm.toFixed(6)}:${n.rho.toFixed(6)}`);
    h.update(
      `${n.gov.intent.toFixed(4)},${n.gov.evidence.toFixed(4)},${n.gov.conformance.toFixed(4)},${n.gov.stewardship.toFixed(4)};`,
    );
  }
  return h.digest("hex");
}
