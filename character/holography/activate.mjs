/**
 * Entanglement-driven animation (minimal / partial).
 *
 * Increase ρ in a region ("muscle activation") → propagate via w_ij →
 * vertex displacement / bone hint. Not a keyframe replacement.
 *
 * Status: **partial**
 */

import { recomputeCurvature, DEFAULT_ALPHA, DEFAULT_BETA } from "./skin-egt.mjs";

export const ACTIVATE_STATUS = "partial";

/**
 * Select seed vertices in a named region (or by y-band / explicit ids).
 * @param {object} egt — skin EGT
 * @param {{ region?: string, vertexIds?: number[], yMin?: number, yMax?: number, maxSeeds?: number }} sel
 */
export function selectActivationSeeds(egt, sel = {}) {
  if (sel.vertexIds?.length) return [...new Set(sel.vertexIds.map((i) => i | 0))];
  const out = [];
  const maxSeeds = sel.maxSeeds ?? 48;
  for (const n of egt.nodes) {
    if (sel.region && n.region !== sel.region) continue;
    if (sel.yMin != null && n.position.y < sel.yMin) continue;
    if (sel.yMax != null && n.position.y > sel.yMax) continue;
    out.push(n.id);
    if (out.length >= maxSeeds) break;
  }
  return out;
}

/**
 * Build sparse adjacency list from edges.
 */
function adjFromEdges(egt) {
  const n = egt.nodes.length;
  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push({ j: e.j, w: e.w_ij });
    adj[e.j].push({ j: e.i, w: e.w_ij });
  }
  return adj;
}

/**
 * Propagate activation: deposit energy at seeds, diffuse along w_ij.
 *
 * @param {object} egt
 * @param {number[]} seedIds
 * @param {{ amount?: number, steps?: number, decay?: number, alpha?: number, beta?: number }} [opts]
 * @returns {{ egt: object, deltaRho: Float64Array, displaced: number[][], boneHints: object[], metrics: object }}
 */
export function activateRegion(egt, seedIds, opts = {}) {
  const amount = opts.amount ?? 0.85;
  const steps = Math.max(1, opts.steps ?? 4);
  const decay = opts.decay ?? 0.55;
  const n = egt.nodes.length;
  const adj = adjFromEdges(egt);

  const rho0 = Float64Array.from(egt.rho);
  const delta = new Float64Array(n);
  for (const id of seedIds) {
    if (id >= 0 && id < n) delta[id] += amount;
  }

  // Diffuse: δ' = δ + decay * Σ_j w_ij (δ_j − δ_i)  (Jacobi-ish)
  for (let s = 0; s < steps; s++) {
    const next = new Float64Array(delta);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      let wSum = 0;
      for (const { j, w } of adj[i]) {
        acc += w * (delta[j] - delta[i]);
        wSum += w;
      }
      if (wSum > 0) next[i] += decay * (acc / wSum);
    }
    for (let i = 0; i < n; i++) delta[i] = next[i];
  }

  const rho = new Float64Array(n);
  for (let i = 0; i < n; i++) rho[i] = rho0[i] + delta[i];

  const nextEgt = {
    ...egt,
    rho,
    K: new Float64Array(n),
    epsilon: new Float64Array(n),
    nodes: egt.nodes.map((node) => ({ ...node })),
  };
  recomputeCurvature(nextEgt, {
    alpha: opts.alpha ?? egt.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? egt.beta ?? DEFAULT_BETA,
  });
  nextEgt.w_sum = Float64Array.from(nextEgt.epsilon);

  // Displacement proxy: outward along approximate normal (from neighbor avg)
  // scaled by Δρ — "bulge" from muscle activation
  const displaced = new Array(n);
  let maxDisp = 0;
  let meanNeighborDelta = 0;
  let neighborCount = 0;

  for (let i = 0; i < n; i++) {
    const p = egt.nodes[i].position;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let c = 0;
    for (const { j } of adj[i]) {
      const q = egt.nodes[j].position;
      nx += p.x - q.x;
      ny += p.y - q.y;
      nz += p.z - q.z;
      c++;
      if (delta[i] > 0.05) {
        meanNeighborDelta += delta[j];
        neighborCount++;
      }
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    const scale = 0.04 * delta[i];
    const dx = (nx / len) * scale;
    const dy = (ny / len) * scale;
    const dz = (nz / len) * scale;
    displaced[i] = [p.x + dx, p.y + dy, p.z + dz];
    maxDisp = Math.max(maxDisp, Math.hypot(dx, dy, dz));
    nextEgt.nodes[i].position = {
      x: displaced[i][0],
      y: displaced[i][1],
      z: displaced[i][2],
    };
    // Keep EFR layout in sync with slight y-lift from bulge
    nextEgt.nodes[i].x = displaced[i][0] + 0.55;
    nextEgt.nodes[i].y = displaced[i][1];
  }

  // Bone hints: average Δρ weighted by B_i for each bone
  const boneCount = egt.boneCount || 1;
  const boneEnergy = new Float64Array(boneCount);
  const boneWeight = new Float64Array(boneCount);
  for (let i = 0; i < n; i++) {
    const Bi = egt.nodes[i].B_i;
    if (!Bi) continue;
    for (let b = 0; b < boneCount; b++) {
      if (Bi[b] <= 1e-8) continue;
      boneEnergy[b] += Bi[b] * delta[i];
      boneWeight[b] += Bi[b];
    }
  }
  const boneHints = [];
  for (let b = 0; b < boneCount; b++) {
    if (boneWeight[b] < 1e-8) continue;
    const e = boneEnergy[b] / boneWeight[b];
    if (e < 0.02) continue;
    boneHints.push({
      boneIndex: b,
      boneId: egt.boneIds?.[b] ?? `bone_${b}`,
      activation: e,
      status: "partial",
      note: "hint only — not a full IK / muscle solver",
    });
  }
  boneHints.sort((a, b) => b.activation - a.activation);

  const seedSet = new Set(seedIds);
  let neighborRhoGain = 0;
  let neighborN = 0;
  for (const sid of seedIds) {
    for (const { j } of adj[sid] || []) {
      if (seedSet.has(j)) continue;
      neighborRhoGain += delta[j];
      neighborN++;
    }
  }

  const metrics = {
    seedCount: seedIds.length,
    maxDeltaRho: Math.max(...delta),
    meanNeighborDeltaRho: neighborN > 0 ? neighborRhoGain / neighborN : 0,
    maxDisplacement: maxDisp,
    boneHintsTop: boneHints.slice(0, 5),
    status: ACTIVATE_STATUS,
  };

  return {
    egt: nextEgt,
    deltaRho: delta,
    displaced,
    boneHints,
    metrics,
    baselineRho: rho0,
  };
}

/**
 * Assert activation raised neighbor ρ and displaced verts vs baseline.
 * @returns {{ ok: boolean, checks: object }}
 */
export function assertActivationEffect(result, seedIds) {
  const { deltaRho, metrics, egt } = result;
  const adj = adjFromEdges(egt);
  const seedSet = new Set(seedIds);
  let neighborLift = 0;
  let n = 0;
  for (const sid of seedIds) {
    for (const { j } of adj[sid] || []) {
      if (seedSet.has(j)) continue;
      neighborLift += deltaRho[j];
      n++;
    }
  }
  const meanNeighbor = n > 0 ? neighborLift / n : 0;
  const checks = {
    neighborRhoIncreased: meanNeighbor > 1e-4,
    verticesDisplaced: metrics.maxDisplacement > 1e-6,
    seedsActivated: metrics.maxDeltaRho > 0.1,
  };
  return {
    ok: checks.neighborRhoIncreased && checks.verticesDisplaced && checks.seedsActivated,
    meanNeighborDeltaRho: meanNeighbor,
    checks,
  };
}
