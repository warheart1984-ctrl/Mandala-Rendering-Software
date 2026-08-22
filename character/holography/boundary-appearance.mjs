/**
 * Boundary appearance from EGT fields (partial).
 *
 * Realism here is information density on the skin boundary:
 *   muscle bulge  = base * (1 + ρ * anisotropy)
 *   bone lock     = |K| stable across frames (> kLock)
 *   joints        = d̂^{ij} flip > jointDeg (default 60°)
 *   skin shading  = induced metric h_ij (applied at EFR COMPOSITE)
 *
 * Not photoreal mesh / Unreal PBR. Status: **partial**.
 */

import { buildRigNodes, mat3PrincipalDirection } from "./rig-node.mjs";
import { inducedMetricHij, g_munu } from "../../mandala/holography/projector.mjs";

export const BOUNDARY_APPEARANCE_STATUS = "partial";
export const REALISTIC_DEFAULT_STATUS = "declared";
export const JOINT_FLIP_DEG = 60;
export const JOINT_ALIGN_COS = Math.cos((JOINT_FLIP_DEG * Math.PI) / 180);
export const K_LOCK = 0.8;
export const MUSCLE_BULGE = 0.3;
/** Skip per-node muscle bulge when ρ below this (sparse partial — not topology compact). */
export const VACUUM_RHO = 0.05;

function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

function cloneEgt(egt) {
  return {
    ...egt,
    rho: Float64Array.from(egt.rho),
    K: egt.K ? Float64Array.from(egt.K) : new Float64Array(egt.nodes.length),
    epsilon: egt.epsilon
      ? Float64Array.from(egt.epsilon)
      : new Float64Array(egt.nodes.length),
    edges: egt.edges.map((e) => ({ ...e })),
    nodes: egt.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      gov: n.gov ? { ...n.gov } : undefined,
      E: n.E ? Float64Array.from(n.E) : undefined,
      normal: n.normal ? [...n.normal] : undefined,
    })),
    E_norms: egt.E_norms ? Float64Array.from(egt.E_norms) : undefined,
  };
}

/**
 * Detect joints where principal entanglement directions disagree by > jointDeg.
 */
export function detectEntanglementJoints(egt, opts = {}) {
  const alignMin = opts.alignMin ?? JOINT_ALIGN_COS;
  const joints = [];
  for (const e of egt.edges) {
    const Ei = egt.nodes[e.i].E || egt.rigNodes?.[e.i]?.E;
    const Ej = egt.nodes[e.j].E || egt.rigNodes?.[e.j]?.E;
    if (!Ei || !Ej) continue;
    const pi = mat3PrincipalDirection(Ei);
    const pj = mat3PrincipalDirection(Ej);
    const align = Math.abs(
      pi.v[0] * pj.v[0] + pi.v[1] * pj.v[1] + pi.v[2] * pj.v[2],
    );
    const gap = 1 - align;
    if (align < alignMin) {
      joints.push({
        i: e.i,
        j: e.j,
        discontinuity: gap,
        deg: (Math.acos(Math.max(-1, Math.min(1, align))) * 180) / Math.PI,
      });
    }
  }
  joints.sort((a, b) => b.discontinuity - a.discontinuity);
  return joints.slice(0, opts.maxJoints ?? 16);
}

/**
 * Apply ρ-anisotropy muscle bulge; skip K-stable bone nodes.
 * @param {object} egt
 * @param {object} [anatomy] synthesizeAnatomyFromBoundary result
 * @param {{ prevK?: Float64Array, muscleBulge?: number, kLock?: number }} [opts]
 */
export function applyBoundaryAppearance(egt0, anatomy = null, opts = {}) {
  const egt = cloneEgt(egt0);
  buildRigNodes(egt, { mutate: true });
  const bulge = opts.muscleBulge ?? MUSCLE_BULGE;
  const kLock = opts.kLock ?? K_LOCK;
  const prevK = opts.prevK;
  const n = egt.nodes.length;
  const boneLocked = new Uint8Array(n);
  const muscleSet = new Set(anatomy?.labels?.muscleVertexIds || []);
  const boneSet = new Set();
  for (const [a, b] of anatomy?.labels?.boneEdges || []) {
    boneSet.add(a);
    boneSet.add(b);
  }

  let lockedCount = 0;
  for (let i = 0; i < n; i++) {
    const kAbs = Math.abs(egt.K[i] || 0);
    const kPrev = prevK ? Math.abs(prevK[i] || 0) : kAbs;
    const stable = kAbs >= kLock && Math.abs(kAbs - kPrev) < 0.08;
    if (stable || (boneSet.has(i) && kAbs >= kLock * 0.7)) {
      boneLocked[i] = 1;
      lockedCount++;
    }
  }

  const vacuumRho = opts.vacuumRho ?? VACUUM_RHO;
  for (let i = 0; i < n; i++) {
    if (boneLocked[i]) continue;
    const rho = egt.rho[i] || 0;
    // Sparse partial: skip vacuum nodes — do not rewrite bone/joint connectivity.
    if (rho < vacuumRho) continue;
    const E = egt.nodes[i].E;
    const aniso = E
      ? Math.min(1, Math.abs(mat3PrincipalDirection(E).lambda) / (egt.E_norms[i] || 1e-12))
      : 0;
    const scale = 1 + rho * aniso * bulge;
    const N = egt.nodes[i].normal || [0, 0, 1];
    const extra = (scale - 1) * (muscleSet.has(i) ? 1 : 0.35);
    const p = egt.nodes[i].position;
    p.x += N[0] * extra * 0.04;
    p.y += N[1] * extra * 0.04;
    p.z += N[2] * extra * 0.04;
    egt.nodes[i].x = p.x + 0.55;
    egt.nodes[i].y = p.y;
  }

  const joints = detectEntanglementJoints(egt, {
    alignMin: opts.alignMin ?? JOINT_ALIGN_COS,
  });
  egt.h_ij = egt.h_ij || inducedMetricHij(g_munu);
  egt.boundaryAppearance = {
    status: BOUNDARY_APPEARANCE_STATUS,
    realisticDefault: REALISTIC_DEFAULT_STATUS,
    muscleBulge: bulge,
    kLock,
    jointDeg: JOINT_FLIP_DEG,
    lockedCount,
    boneLocked,
    muscleSet,
    boneSet,
    joints,
  };
  return egt;
}

export function projectRigNodesH(egt) {
  // Spatial 3-metric is already on nodes; Movie Lane records this projection.
  return {
    organ: "Mandala",
    projector: "P_h-unit-timelike-normal",
    nodeCount: egt.nodes.length,
    h_ij: egt.h_ij || inducedMetricHij(g_munu),
    positions: egt.nodes.map((n) => posArr(n.position)),
  };
}
