/**
 * Boundary-driven anatomy synthesis (partial / toy).
 *
 * Infer muscles / bones / soft tissue from boundary fields:
 *   E_i (entanglement tensor), K_i, ρ_i, gov
 *
 * NOT living anatomical field / living taxonomy as enforced.
 * Status: **partial** — synthetic cluster decode. Full species anatomy = **declared**.
 */

import { createHash } from "node:crypto";
import {
  buildRigNodes,
  mat3PrincipalDirection,
  mat3Frobenius,
} from "./rig-node.mjs";
import { attachGovernanceCoords } from "./rig-ciems.mjs";

export const ANATOMY_SYNTHESIS_STATUS = "partial";
export const LIVING_ANATOMY_STATUS = "declared";

function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function anisotropyScore(E) {
  const { v, lambda } = mat3PrincipalDirection(E);
  const f = mat3Frobenius(E) || 1e-12;
  // λ / ‖E‖_F ≈ how directional the coupling is
  return { score: Math.max(0, Math.min(1, Math.abs(lambda) / f)), fiber: v, lambda };
}

/**
 * Score nodes for muscle candidacy: high E anisotropy, high ρ, consistent K.
 */
export function scoreMuscleCandidates(egt) {
  if (!egt.rigNodes) buildRigNodes(egt, { mutate: true });
  const scores = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    const E = egt.nodes[i].E || egt.rigNodes[i].E;
    const aniso = anisotropyScore(E);
    const rho = egt.rho[i] || 0;
    const kAbs = Math.abs(egt.K?.[i] || 0);
    const s = 0.45 * aniso.score + 0.4 * Math.min(1, rho) + 0.15 * Math.min(1, kAbs);
    scores.push({
      id: i,
      score: s,
      fiber: aniso.fiber,
      rho,
      K: egt.K?.[i] || 0,
      aniso: aniso.score,
    });
  }
  return scores;
}

/**
 * Greedy cluster: seed high-score nodes, grow by fiber-aligned neighbors.
 */
export function inferMuscleClusters(egt, opts = {}) {
  const topK = opts.topK ?? 3;
  const minSize = opts.minSize ?? 4;
  const seedThresh = opts.seedThresh ?? 0.35;
  const scores = scoreMuscleCandidates(egt);
  const ranked = [...scores].sort((a, b) => b.score - a.score);

  const adj = Array.from({ length: egt.nodes.length }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push({ j: e.j, w: e.w_ij });
    adj[e.j].push({ j: e.i, w: e.w_ij });
  }

  const taken = new Set();
  const clusters = [];

  for (const seed of ranked) {
    if (clusters.length >= topK) break;
    if (seed.score < seedThresh || taken.has(seed.id)) continue;

    const fiber = seed.fiber;
    const members = new Set([seed.id]);
    const queue = [seed.id];
    taken.add(seed.id);

    while (queue.length) {
      const i = queue.shift();
      for (const { j, w } of adj[i]) {
        if (taken.has(j) || members.has(j)) continue;
        const sj = scores[j];
        if (sj.score < seedThresh * 0.7) continue;
        const align = Math.abs(dot3(sj.fiber, fiber));
        if (align < 0.45 && w < 0.35) continue;
        // Consistent K gradient: similar |K| band
        if (Math.abs(Math.abs(sj.K) - Math.abs(seed.K)) > 0.85) continue;
        members.add(j);
        taken.add(j);
        queue.push(j);
        if (members.size >= (opts.maxCluster ?? 48)) break;
      }
      if (members.size >= (opts.maxCluster ?? 48)) break;
    }

    if (members.size < minSize) {
      for (const m of members) taken.delete(m);
      continue;
    }

    const ids = [...members];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let meanRho = 0;
    let meanK = 0;
    for (const id of ids) {
      const p = posArr(egt.nodes[id].position);
      cx += p[0];
      cy += p[1];
      cz += p[2];
      meanRho += egt.rho[id];
      meanK += egt.K[id];
    }
    const n = ids.length;
    clusters.push({
      kind: "muscle-cluster",
      id: clusters.length,
      vertexIds: ids,
      fiberDir: fiber,
      centroid: { x: cx / n, y: cy / n, z: cz / n },
      meanRho: meanRho / n,
      meanK: meanK / n,
      meanAniso: ids.reduce((s, id) => s + scores[id].aniso, 0) / n,
      status: ANATOMY_SYNTHESIS_STATUS,
    });
  }

  return {
    kind: "inferred-muscles",
    status: ANATOMY_SYNTHESIS_STATUS,
    livingAnatomy: LIVING_ANATOMY_STATUS,
    clusters,
  };
}

/**
 * Bone paths: low ρ variance, high |K| stability, low entanglement variance along edges.
 * Joints: discontinuities in principal-direction field.
 */
export function inferBonePaths(egt, opts = {}) {
  if (!egt.rigNodes) buildRigNodes(egt, { mutate: true });
  const maxPaths = opts.maxPaths ?? 8;
  const edgeScores = [];

  for (const e of egt.edges) {
    const ri = egt.rho[e.i];
    const rj = egt.rho[e.j];
    const meanRho = 0.5 * (ri + rj);
    const rhoVar = Math.abs(ri - rj);
    const ki = Math.abs(egt.K[e.i]);
    const kj = Math.abs(egt.K[e.j]);
    const meanK = 0.5 * (ki + kj);
    const kStab = 1 / (1 + Math.abs(ki - kj));
    const ei = egt.E_norms?.[e.i] ?? egt.nodes[e.i].E_norm ?? 0;
    const ej = egt.E_norms?.[e.j] ?? egt.nodes[e.j].E_norm ?? 0;
    const eVar = Math.abs(ei - ej);
    // Prefer low deformation (ρ), high K, low E variance
    const boneScore =
      0.35 * (1 - Math.min(1, meanRho)) +
      0.35 * Math.min(1, meanK) * kStab +
      0.3 * (1 / (1 + eVar));

    const pi = mat3PrincipalDirection(egt.nodes[e.i].E || egt.rigNodes[e.i].E);
    const pj = mat3PrincipalDirection(egt.nodes[e.j].E || egt.rigNodes[e.j].E);
    const align = Math.abs(dot3(pi.v, pj.v));
    const jointGap = 1 - align;

    edgeScores.push({
      i: e.i,
      j: e.j,
      boneScore,
      jointGap,
      meanK,
      meanRho,
      isJoint: jointGap > (opts.jointThresh ?? 0.55),
    });
  }

  edgeScores.sort((a, b) => b.boneScore - a.boneScore);
  const paths = edgeScores
    .filter((e) => !e.isJoint && e.boneScore > (opts.boneThresh ?? 0.4))
    .slice(0, maxPaths)
    .map((e, idx) => ({
      kind: "bone-path",
      id: idx,
      i: e.i,
      j: e.j,
      score: e.boneScore,
      meanK: e.meanK,
      meanRho: e.meanRho,
      status: ANATOMY_SYNTHESIS_STATUS,
    }));

  const joints = edgeScores
    .filter((e) => e.isJoint)
    .sort((a, b) => b.jointGap - a.jointGap)
    .slice(0, opts.maxJoints ?? 12)
    .map((e, idx) => ({
      kind: "joint",
      id: idx,
      i: e.i,
      j: e.j,
      discontinuity: e.jointGap,
      status: ANATOMY_SYNTHESIS_STATUS,
    }));

  return {
    kind: "inferred-bones",
    status: ANATOMY_SYNTHESIS_STATUS,
    livingAnatomy: LIVING_ANATOMY_STATUS,
    paths,
    joints,
  };
}

/**
 * Soft tissue: lower |K|, moderate/high mass proxy (1/stiffness), stewardship soft constraint.
 */
export function inferSoftTissue(egt, opts = {}) {
  if (!egt.nodes[0]?.gov) attachGovernanceCoords(egt);
  const zones = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    const kAbs = Math.abs(egt.K[i] || 0);
    const rho = egt.rho[i] || 0;
    const eNorm = egt.E_norms?.[i] ?? egt.nodes[i].E_norm ?? 0;
    // Low frequency ≈ low |K|; high mass ≈ moderate ρ with low stiffness (low eNorm)
    const stiffness = eNorm / (1 + eNorm);
    const massProxy = Math.min(1, 0.3 + 0.5 * rho);
    const softScore =
      0.4 * (1 / (1 + 4 * kAbs)) +
      0.35 * massProxy * (1 - stiffness) +
      0.25 * (egt.nodes[i].gov?.stewardship ?? 0.5);
    if (softScore > (opts.softThresh ?? 0.45)) {
      zones.push({
        id: i,
        softScore,
        massProxy,
        stiffness,
        stewardship: egt.nodes[i].gov?.stewardship ?? 0.5,
      });
    }
  }
  zones.sort((a, b) => b.softScore - a.softScore);

  // Stewardship soft constraint: refuse collapse (mean mass floor)
  const meanMass =
    zones.reduce((s, z) => s + z.massProxy, 0) / (zones.length || 1);
  const noCollapse = meanMass >= (opts.minMass ?? 0.25);

  return {
    kind: "inferred-soft-tissue",
    status: ANATOMY_SYNTHESIS_STATUS,
    livingAnatomy: LIVING_ANATOMY_STATUS,
    zoneCount: zones.length,
    zones: zones.slice(0, opts.topZones ?? 64),
    stewardship: {
      noCollapse,
      meanMass,
      note: "Soft constraint only — not living tissue enforcement",
    },
  };
}

/**
 * Full boundary → bulk inference package.
 */
export function synthesizeAnatomyFromBoundary(egt, opts = {}) {
  buildRigNodes(egt, { mutate: true });
  attachGovernanceCoords(egt);

  const muscles = inferMuscleClusters(egt, opts.muscle);
  const bones = inferBonePaths(egt, opts.bone);
  const soft = inferSoftTissue(egt, opts.soft);

  const fingerprint = createHash("sha256")
    .update("character.holography.anatomy-synthesis.v1")
    .update(String(muscles.clusters.length))
    .update(String(bones.paths.length))
    .update(String(soft.zoneCount))
    .digest("hex");

  return {
    kind: "bulk-inferred",
    status: ANATOMY_SYNTHESIS_STATUS,
    claim:
      "Toy bulk from boundary E/K/ρ/gov — not living anatomical field; not enforced taxonomy",
    livingAnatomy: LIVING_ANATOMY_STATUS,
    muscles,
    bones,
    soft,
    labels: {
      muscleVertexIds: muscles.clusters.flatMap((c) => c.vertexIds),
      boneEdges: bones.paths.map((p) => [p.i, p.j]),
      softVertexIds: soft.zones.map((z) => z.id),
    },
    fingerprint,
  };
}

/**
 * Build a proxy EGT coloring for label overlay (muscle=high ρ red, bone=K tint).
 */
export function anatomyLabelProxyEgt(egt, inferred) {
  const n = egt.nodes.length;
  const rho = new Float64Array(n);
  const K = new Float64Array(n);
  const muscleSet = new Set(inferred.labels.muscleVertexIds);
  const softSet = new Set(inferred.labels.softVertexIds);
  const boneSet = new Set();
  for (const [a, b] of inferred.labels.boneEdges) {
    boneSet.add(a);
    boneSet.add(b);
  }
  for (let i = 0; i < n; i++) {
    if (muscleSet.has(i)) {
      rho[i] = 0.95;
      K[i] = 0.2;
    } else if (boneSet.has(i)) {
      rho[i] = 0.35;
      K[i] = 0.9;
    } else if (softSet.has(i)) {
      rho[i] = 0.55;
      K[i] = 0.05;
    } else {
      rho[i] = 0.12;
      K[i] = 0.1;
    }
  }
  return { ...egt, rho, K };
}
