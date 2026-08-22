/**
 * EGT — Entanglement Graph Tensor (Claim A — computational / synthetic dual).
 *
 * Time is encoded as relationships on the 3D boundary: the sequence {EGT_t}
 * IS the temporal structure — not a drawn t-axis.
 *
 * Nodes / Edges / CausalLinks / ρ / K — discrete graph proxies.
 * S(A), ε, ∇ε, K are NOT von Neumann entropy or Ryu–Takayanagi area laws.
 * Status: **partial**
 */

import { createHash } from "node:crypto";
import { PROTO_SHAPE } from "../proto/constitution.mjs";
import { encodeBoundary } from "./boundary.mjs";
import {
  projectStaticObserver,
  inducedMetricHij,
  g_munu,
} from "./projector.mjs";
import { nullConstraintOk } from "./metric.mjs";

export const EGT_STATUS = "partial";
export const EGT_CLAIM =
  "Synthetic holographic dual — graph correlation proxies, not AdS/CFT / von Neumann / RT";

/** Curvature proxy defaults: K_i = α‖∇ε‖ + β Δε */
export const DEFAULT_ALPHA = 1.0;
export const DEFAULT_BETA = 0.25;

function assertShape(shape) {
  const nx = shape?.nx | 0;
  const ny = shape?.ny | 0;
  const nz = shape?.nz | 0;
  if (nx < 2 || ny < 2 || nz < 2) {
    throw new Error(`EGT needs nx,ny,nz ≥ 2, got ${nx}×${ny}×${nz}`);
  }
  return { nx, ny, nz, cellCount: nx * ny * nz };
}

/**
 * Entropy proxy for region A (NOT Tr ρ log ρ):
 *   S(A) ≈ Σ_{(i∈A, j∉A)} f(w_ij)
 */
export function entropyProxyS(egt, regionNodeIds, f = (w) => w) {
  const inA = new Set(regionNodeIds);
  let s = 0;
  for (const e of egt.edges) {
    const iIn = inA.has(e.i);
    const jIn = inA.has(e.j);
    if (iIn !== jIn) s += f(e.w_ij);
  }
  return s;
}

export function entropyProxyS_w2(egt, regionNodeIds) {
  return entropyProxyS(egt, regionNodeIds, (w) => w * w);
}

/**
 * Patch S(A) for a node neighborhood (RT-inspired **declared** refinement helper).
 */
export function patchEntropyAround(egt, nodeId, radius = 1) {
  const center = egt.nodes[nodeId];
  if (!center) return 0;
  const ids = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    const n = egt.nodes[i];
    const d = Math.hypot(n.x - center.x, n.y - center.y, (n.faceIdx ?? 0) - (center.faceIdx ?? 0));
    if (d <= radius + 1e-9) ids.push(i);
  }
  return {
    S: entropyProxyS(egt, ids),
    regionSize: ids.length,
    status: "declared",
    note: "RT-inspired patch S(A) — cut-edge sum only, not area-law holography",
  };
}

/**
 * Recompute ε, ∇ε, K from edge weights.
 * ε_i = Σ_j w_ij
 * ∇ε_i ≈ Σ_j (ε_j−ε_i)(x_j−x_i)/‖Δx‖²
 * K_i = α‖∇ε‖ + β Δε ,  Δε_i = Σ_j (ε_j−ε_i)
 */
export function recomputeCurvature(egt, { alpha = DEFAULT_ALPHA, beta = DEFAULT_BETA } = {}) {
  const n = egt.nodes.length;
  const eps = new Float64Array(n);
  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push({ j: e.j, w: e.w_ij });
    adj[e.j].push({ j: e.i, w: e.w_ij });
    eps[e.i] += e.w_ij;
    eps[e.j] += e.w_ij;
  }
  egt.epsilon = eps;
  const K = new Float64Array(n);
  const gradX = new Float64Array(n);
  const gradY = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let lap = 0;
    let gx = 0;
    let gy = 0;
    const ni = egt.nodes[i];
    for (const { j } of adj[i]) {
      const nj = egt.nodes[j];
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const r2 = dx * dx + dy * dy + 1e-12;
      const de = eps[j] - eps[i];
      lap += de;
      gx += (de * dx) / r2;
      gy += (de * dy) / r2;
    }
    const gNorm = Math.hypot(gx, gy);
    gradX[i] = gx;
    gradY[i] = gy;
    K[i] = alpha * gNorm + beta * lap;
  }
  egt.K = K;
  egt.gradEps = { x: gradX, y: gradY };
  egt.alpha = alpha;
  egt.beta = beta;
  return egt;
}

function faceLayouts(shape) {
  const { nx, ny, nz } = shape;
  return [
    { id: "negX", wu: ny, hv: nz, at: (u, v) => ({ x: 0, y: u, z: v }) },
    { id: "posX", wu: ny, hv: nz, at: (u, v) => ({ x: nx - 1, y: u, z: v }) },
    { id: "negY", wu: nx, hv: nz, at: (u, v) => ({ x: u, y: 0, z: v }) },
    { id: "posY", wu: nx, hv: nz, at: (u, v) => ({ x: u, y: ny - 1, z: v }) },
    { id: "negZ", wu: nx, hv: ny, at: (u, v) => ({ x: u, y: v, z: 0 }) },
    { id: "posZ", wu: nx, hv: ny, at: (u, v) => ({ x: u, y: v, z: nz - 1 }) },
  ];
}

/**
 * Build EGT from bulk scalar on cube faces via projector P (static observer).
 *
 * @param {object} bulk — { scalar, shape, t?, defect?, temporal? }
 * @param {{ stride?: number, alpha?: number, beta?: number, t?: number }} [opts]
 */
export function buildEGT(bulk, opts = {}) {
  const shape = assertShape(bulk.shape || PROTO_SHAPE);
  const stride = Math.max(1, opts.stride | 0 || 2);
  const t = opts.t != null ? opts.t | 0 : bulk.t | 0;
  const scalar = bulk.scalar;
  if (!scalar || scalar.length < shape.cellCount) {
    throw new Error("buildEGT requires bulk.scalar");
  }

  const boundary = encodeBoundary(scalar, shape, { t });
  const layouts = faceLayouts(shape);
  const nodes = [];
  const rho = [];
  const nodeKey = new Map();

  let faceIdx = 0;
  for (const face of layouts) {
    const facePhi = boundary.faces[face.id];
    for (let v = 0; v < face.hv; v += stride) {
      for (let u = 0; u < face.wu; u += stride) {
        const cell = face.at(u, v);
        const p = projectStaticObserver([t, cell.x, cell.y, cell.z]);
        const fi = u + face.wu * v;
        const phi = facePhi[Math.min(fi, facePhi.length - 1)];
        const id = nodes.length;
        nodes.push({
          id,
          position: { x: p.x, y: p.y, z: p.z },
          x: u / Math.max(1, face.wu - 1) + faceIdx * 1.1,
          y: v / Math.max(1, face.hv - 1),
          faceId: face.id,
          faceIdx,
          u,
          v,
          bulk: cell,
        });
        // ρ ← |φ| / energy-density proxy (NOT quantum density matrix)
        rho.push(Math.abs(phi));
        nodeKey.set(`${face.id}:${u},${v}`, id);
      }
    }
    faceIdx++;
  }

  const edges = [];
  const causalLinks = [];
  const neighbor = [
    [stride, 0],
    [0, stride],
  ];

  faceIdx = 0;
  for (const face of layouts) {
    for (let v = 0; v < face.hv; v += stride) {
      for (let u = 0; u < face.wu; u += stride) {
        const i = nodeKey.get(`${face.id}:${u},${v}`);
        if (i == null) continue;
        const facePhi = boundary.faces[face.id];
        const phiI = facePhi[u + face.wu * v];
        for (const [du, dv] of neighbor) {
          const uu = u + du;
          const vv = v + dv;
          if (uu >= face.wu || vv >= face.hv) continue;
          const j = nodeKey.get(`${face.id}:${uu},${vv}`);
          if (j == null) continue;
          const phiJ = facePhi[uu + face.wu * vv];
          const w = 1 / (1 + Math.abs(phiI - phiJ));
          edges.push({ i, j, w_ij: w });
          // Causal ordering proxy: higher |φ| → lower along "flow"
          const strength = Math.min(1, Math.abs(phiI - phiJ));
          if (phiI >= phiJ) {
            causalLinks.push({ from: i, to: j, strength });
          } else {
            causalLinks.push({ from: j, to: i, strength });
          }
          // Light-cone stub on face lattice (Δu,Δv vs unit Δt)
          void nullConstraintOk(du, dv, 0, Math.max(stride, 1));
        }
      }
    }
    faceIdx++;
  }

  // Defect → boost local ρ / causal hub
  if (bulk.defect) {
    const { x, y, z } = bulk.defect;
    for (const n of nodes) {
      if (n.bulk.x === x && n.bulk.y === y && n.bulk.z === z) {
        rho[n.id] += 0.5;
      }
    }
  }

  const egt = {
    kind: "entanglement-graph-tensor",
    status: EGT_STATUS,
    claim: EGT_CLAIM,
    t,
    shape: { nx: shape.nx, ny: shape.ny, nz: shape.nz },
    stride,
    nodes,
    edges,
    C: causalLinks,
    causalLinks,
    rho: Float64Array.from(rho),
    K: new Float64Array(nodes.length),
    epsilon: new Float64Array(nodes.length),
    h_ij: inducedMetricHij(g_munu),
    projectorId: "P_flat-static-observer",
    dictionary: Object.freeze({
      S_A: "cut-edge sum f(w) — declared entropy proxy, not von Neumann",
      RT: "declared inspiration only",
      time: "sequence {EGT_t} is temporal structure",
    }),
  };

  recomputeCurvature(egt, {
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? DEFAULT_BETA,
  });
  egt.hash = hashEGT(egt);
  return egt;
}

/**
 * EGT(t+1) = Update(EGT(t), BulkState(t))
 * Rebuilds from current bulk (deterministic); preserves prior hash chain note.
 */
export function updateEGT(egt, bulk, opts = {}) {
  const next = buildEGT(bulk, {
    stride: opts.stride ?? egt?.stride ?? 2,
    alpha: opts.alpha ?? egt?.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? egt?.beta ?? DEFAULT_BETA,
    t: opts.t != null ? opts.t : bulk.t,
  });
  next.prevHash = egt?.hash ?? null;
  return next;
}

/**
 * Evolve / sample {EGT_t} for frames length.
 * If bulk has temporal cache, sample each t; else regenerate from live scalar
 * with stamped t index (same φ — still valid length test).
 */
export function evolveEGTSequence(bulk, frames, opts = {}) {
  const nFrames = Math.max(1, frames | 0);
  const seq = [];
  const filled = bulk.temporal?.filled | 0;
  const cellN = (bulk.shape || PROTO_SHAPE).cellCount;

  for (let t = 0; t < nFrames; t++) {
    let sliceBulk = bulk;
    if (bulk.temporal?.scalarCache && filled > 0) {
      const tt = Math.min(t, filled - 1);
      const scalar = bulk.temporal.scalarCache.subarray(tt * cellN, tt * cellN + cellN);
      sliceBulk = {
        ...bulk,
        scalar,
        t: tt,
        defect: bulk.temporal.defectWorldline?.[tt] || bulk.defect,
      };
    } else {
      sliceBulk = { ...bulk, t };
    }
    const egt = buildEGT(sliceBulk, { ...opts, t: sliceBulk.t });
    seq.push(egt);
  }
  return {
    kind: "egt-sequence",
    status: EGT_STATUS,
    length: seq.length,
    frames: seq,
    note: "Time = evolution of entanglement graph {EGT_t}",
  };
}

export function hashEGT(egt) {
  const h = createHash("sha256");
  h.update("mandala.holography.egt.v1");
  h.update(`\0${egt.t}|${egt.nodes.length}|${egt.edges.length}\0`);
  for (const n of egt.nodes) {
    h.update(`${n.id}:${n.faceId}:${n.u},${n.v};`);
  }
  for (const e of egt.edges) {
    h.update(`${e.i}-${e.j}:${e.w_ij.toFixed(8)};`);
  }
  for (let i = 0; i < egt.rho.length; i++) {
    h.update(`${egt.rho[i].toFixed(8)},${egt.K[i].toFixed(8)};`);
  }
  return h.digest("hex");
}
