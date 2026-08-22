/**
 * Skin → EGT: character mesh as holographic boundary.
 *
 * Skin vertices = boundary nodes; rig + anatomy = bulk encoded in boundary
 * (B_i bone influences, ρ_i deformation/stress proxy, w_ij neighbor coupling).
 *
 * Reuses mandala/holography EGT curvature (ε, ∇ε, K) — does NOT fork theory.
 * Status: **partial** — synthetic informational character layer, not living organism.
 */

import { createHash } from "node:crypto";
import {
  DEFAULT_ALPHA,
  DEFAULT_BETA,
  EGT_CLAIM,
  EGT_STATUS,
  hashEGT,
  recomputeCurvature,
  entropyProxyS,
} from "../../mandala/holography/egt.mjs";
import { inducedMetricHij, g_munu } from "../../mandala/holography/projector.mjs";

export const SKIN_EGT_STATUS = "partial";
export const SKIN_EGT_CLAIM =
  "Synthetic informational character layer — skin boundary encodes rig/anatomy proxies; not biological holography";

/** Material-region affinity for edge weights (same region → stronger coupling). */
const REGION_AFFINITY = 0.35;
const BONE_SIM_WEIGHT = 0.45;
const MESH_BASE_WEIGHT = 0.20;

/**
 * Dense bone-influence vector from top-k joints/weights (char_rigged style).
 * @param {number[]} joints — bone indices
 * @param {number[]} weights — skin weights
 * @param {number} boneCount
 */
export function boneInfluenceVector(joints, weights, boneCount) {
  const B = new Float64Array(boneCount);
  for (let k = 0; k < joints.length; k++) {
    const bi = joints[k] | 0;
    if (bi >= 0 && bi < boneCount) B[bi] += weights[k] || 0;
  }
  return B;
}

/** Cosine similarity of two bone-influence vectors ∈ [0, 1]. */
export function boneSimilarity(Ba, Bb) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(Ba.length, Bb.length);
  for (let i = 0; i < n; i++) {
    dot += Ba[i] * Bb[i];
    na += Ba[i] * Ba[i];
    nb += Bb[i] * Bb[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  if (d < 1e-12) return 0;
  return Math.max(0, Math.min(1, dot / d));
}

/**
 * Deformation / stress proxy ρ_i from local bone-weight disagreement + jointness.
 * High multi-bone blend or neighbor B mismatch → higher info density.
 */
export function stressProxyRho(B, neighborBs, edgeLens) {
  let jointness = 0;
  for (let i = 0; i < B.length; i++) {
    const w = B[i];
    if (w > 1e-8) jointness += w * (1 - w);
  }
  let mismatch = 0;
  let wSum = 0;
  for (let n = 0; n < neighborBs.length; n++) {
    const sim = boneSimilarity(B, neighborBs[n]);
    const len = edgeLens[n] || 1;
    mismatch += (1 - sim) / (1 + len);
    wSum += 1;
  }
  const meanMis = wSum > 0 ? mismatch / wSum : 0;
  return 0.15 + 0.55 * jointness + 0.45 * meanMis;
}

/**
 * Build undirected adjacency from quads / triangle edges.
 * @returns {Map<number, Set<number>>}
 */
export function meshAdjacency(quadsOrEdges) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const face of quadsOrEdges) {
    if (face.length === 2) {
      add(face[0], face[1]);
    } else {
      const m = face.length;
      for (let i = 0; i < m; i++) add(face[i], face[(i + 1) % m]);
    }
  }
  return adj;
}

function regionOfVertex(regions, quads, vi) {
  if (Array.isArray(regions) && typeof regions[vi] === "string") {
    return regions[vi];
  }
  // regions may be per-quad; fall back to first quad mentioning vi
  if (Array.isArray(quads) && Array.isArray(regions)) {
    for (let qi = 0; qi < quads.length; qi++) {
      if (quads[qi].includes(vi)) return regions[qi] || "skin";
    }
  }
  return "skin";
}

/**
 * Build skin EGT from a character asset (or mesh + skin + armature pieces).
 *
 * @param {object} asset — from buildCharacterAsset() or compatible shape
 * @param {{ alpha?: number, beta?: number, t?: number }} [opts]
 */
export function buildSkinEGT(asset, opts = {}) {
  const positions = asset.mesh?.positions || asset.positions;
  const quads = asset.mesh?.quads || asset.quads || [];
  const edgesWire = asset.edges || [];
  const skin = asset.skin;
  const armature = asset.armature;
  const regions = asset.mesh?.regions || asset.regions || [];

  if (!positions?.length) {
    throw new Error("buildSkinEGT requires mesh positions");
  }
  if (!skin?.joints || !skin?.weights) {
    throw new Error("buildSkinEGT requires skin.joints / skin.weights (paintWeights)");
  }

  const boneCount = armature?.bones?.length || 1;
  const n = positions.length;
  const adj = meshAdjacency(quads.length ? quads : edgesWire);

  const B = new Array(n);
  for (let i = 0; i < n; i++) {
    B[i] = boneInfluenceVector(skin.joints[i], skin.weights[i], boneCount);
  }

  const nodes = [];
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const region = regionOfVertex(regions, quads, i);
    // EFR layout: project height-forward silhouette (x,y) for 2D viz
    nodes.push({
      id: i,
      position: { x: p[0], y: p[1], z: p[2] },
      x: p[0] + 0.55, // shift into positive for heatmap bounds
      y: p[1],
      faceId: "skin",
      faceIdx: 0,
      u: i,
      v: 0,
      region,
      B_i: B[i],
      boneTop: {
        joints: skin.joints[i].slice(),
        weights: skin.weights[i].slice(),
      },
    });
  }

  const edges = [];
  const causalLinks = [];
  const seen = new Set();

  for (let i = 0; i < n; i++) {
    const neigh = adj.get(i);
    if (!neigh) continue;
    for (const j of neigh) {
      if (j <= i) continue;
      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pi = positions[i];
      const pj = positions[j];
      const dist = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]) || 1e-4;
      const simB = boneSimilarity(B[i], B[j]);
      const sameRegion = nodes[i].region === nodes[j].region ? 1 : 0;
      const w =
        MESH_BASE_WEIGHT / (1 + dist) +
        BONE_SIM_WEIGHT * simB +
        REGION_AFFINITY * sameRegion;
      const w_ij = Math.max(0.02, Math.min(1, w));
      edges.push({ i, j, w_ij, dist, simB, sameRegion: !!sameRegion });

      // Causal proxy: higher jointness → "source" of deformation flow
      let jointI = 0;
      let jointJ = 0;
      for (let k = 0; k < B[i].length; k++) {
        const wi = B[i][k];
        const wj = B[j][k];
        if (wi > 1e-8) jointI += wi * (1 - wi);
        if (wj > 1e-8) jointJ += wj * (1 - wj);
      }
      const strength = Math.min(1, Math.abs(jointI - jointJ) + (1 - simB) * 0.5);
      if (jointI >= jointJ) causalLinks.push({ from: i, to: j, strength });
      else causalLinks.push({ from: j, to: i, strength });
    }
  }

  // ρ from stress proxy using adjacency
  const rho = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const neigh = [...(adj.get(i) || [])];
    const nBs = neigh.map((j) => B[j]);
    const lens = neigh.map((j) => {
      const a = positions[i];
      const b = positions[j];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    });
    rho[i] = stressProxyRho(B[i], nBs, lens);
  }

  const egt = {
    kind: "skin-entanglement-graph-tensor",
    status: SKIN_EGT_STATUS,
    claim: SKIN_EGT_CLAIM,
    egtStatus: EGT_STATUS,
    egtClaim: EGT_CLAIM,
    t: opts.t | 0,
    characterId: asset.id || "char",
    boneCount,
    boneIds: (armature?.bones || []).map((b) => b.id),
    nodes,
    edges,
    C: causalLinks,
    causalLinks,
    rho,
    K: new Float64Array(n),
    epsilon: new Float64Array(n),
    h_ij: inducedMetricHij(g_munu),
    projectorId: "P_skin-boundary-mesh",
    dictionary: Object.freeze({
      boundary: "skin mesh vertices",
      bulk: "rig bones + anatomy — reconstructed as partial/toy from B_i clusters",
      rho: "deformation energy / stress proxy (not quantum density)",
      B_i: "bone influence vector from char_rigged weights",
      w_ij: "mesh adjacency + bone-weight similarity + material region",
      S_A: "cut-edge sum — same proxy as mandala/holography EGT",
      K: "α‖∇ε‖ + βΔε via recomputeCurvature from mandala/holography",
    }),
  };

  recomputeCurvature(egt, {
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? DEFAULT_BETA,
  });

  // Attach per-node w_sum (= ε after recompute) for shader binding
  egt.w_sum = Float64Array.from(egt.epsilon);
  egt.hash = hashSkinEGT(egt);
  return egt;
}

export function hashSkinEGT(egt) {
  const h = createHash("sha256");
  h.update("character.holography.skin-egt.v1");
  h.update(`\0${egt.characterId}|${egt.nodes.length}|${egt.edges.length}\0`);
  for (const e of egt.edges) {
    h.update(`${e.i}-${e.j}:${e.w_ij.toFixed(6)};`);
  }
  for (let i = 0; i < egt.rho.length; i++) {
    h.update(`${egt.rho[i].toFixed(6)},${egt.K[i].toFixed(6)};`);
  }
  // Also fold core EGT hash shape for continuity with mandala/holography
  h.update(hashEGT(egt));
  return h.digest("hex");
}

export { entropyProxyS, recomputeCurvature, DEFAULT_ALPHA, DEFAULT_BETA };
