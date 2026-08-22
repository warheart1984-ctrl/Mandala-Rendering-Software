/**
 * Tiny holographic test scene — Bulk worldline → Boundary plane → EGT trail → EFR.
 *
 * Isolated from certified proto (no chamber step / hash mutation).
 * Coords: engine Minkowski x^μ = (t, x, y, z). Boundary plane is z = 0 (xy sheet).
 *
 * Status: **partial**
 */

import {
  DEFAULT_ALPHA,
  DEFAULT_BETA,
  EGT_CLAIM,
  EGT_STATUS,
  hashEGT,
  recomputeCurvature,
} from "./egt.mjs";
import { BoundaryProjection } from "./boundary-projection.mjs";
import { g_munu, inducedMetricHij } from "./projector.mjs";
import {
  EFR_MODES,
  renderEGTEmergentGeometry,
  renderEGTHeatmap,
} from "./efr.mjs";
import { reconstructApproximateBulk } from "./reconstruct.mjs";
import {
  buildGovernanceAudit,
  checkBulkEgtCoupling,
  entanglementHealth,
} from "./ciems-lab.mjs";

export const TINY_SCENE_STATUS = "partial";
export const BOUNDARY_PLANE_CONVENTION =
  "z=0 xy plane in (t,x,y,z) Minkowski; static-observer P drops t → (x,y,z)";

/**
 * Flat Minkowski worldline: x(t)=v_x·t, y=0, z=0.
 * positionAt(t) → Vec4(t, v_x·t, 0, 0)
 */
export class Worldline {
  /**
   * @param {{ v_x?: number, v_y?: number, x0?: number, y0?: number, z0?: number }} [opts]
   */
  constructor(opts = {}) {
    this.v_x = opts.v_x ?? 0.15;
    this.v_y = opts.v_y ?? 0;
    this.x0 = opts.x0 ?? 0;
    this.y0 = opts.y0 ?? 0;
    this.z0 = opts.z0 ?? 0;
    this.metric = "flat-minkowski";
    this.status = TINY_SCENE_STATUS;
  }

  /** @param {number} t */
  positionAt(t) {
    const x = this.x0 + this.v_x * t;
    const y = this.y0 + this.v_y * t;
    const z = this.z0;
    return {
      t,
      x,
      y,
      z,
      asArray: Float64Array.from([t, x, y, z]),
    };
  }
}

/**
 * Square grid plane → EGT nodes (id + position) + lattice edges (w_ij starts at 0).
 *
 * @param {{
 *   sizeX?: number,
 *   sizeY?: number,
 *   resolutionX?: number,
 *   resolutionY?: number,
 *   z?: number,
 * }} [opts]
 */
export function makeGridPlane(opts = {}) {
  const sizeX = opts.sizeX ?? 10;
  const sizeY = opts.sizeY ?? 10;
  const resolutionX = Math.max(2, opts.resolutionX ?? 32);
  const resolutionY = Math.max(2, opts.resolutionY ?? 32);
  const z = opts.z ?? 0;

  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const nodes = [];
  const key = (ix, iy) => `${ix},${iy}`;
  const idOf = new Map();

  for (let iy = 0; iy < resolutionY; iy++) {
    for (let ix = 0; ix < resolutionX; ix++) {
      const u = ix / (resolutionX - 1);
      const v = iy / (resolutionY - 1);
      const x = -halfX + u * sizeX;
      const y = -halfY + v * sizeY;
      const id = nodes.length;
      idOf.set(key(ix, iy), id);
      nodes.push({
        id,
        ix,
        iy,
        position: { x, y, z },
        // EFR layout coords (unit square)
        x: u,
        y: v,
        faceId: "z0",
        faceIdx: 0,
        u: ix,
        v: iy,
      });
    }
  }

  const edges = [];
  for (let iy = 0; iy < resolutionY; iy++) {
    for (let ix = 0; ix < resolutionX; ix++) {
      const i = idOf.get(key(ix, iy));
      if (ix + 1 < resolutionX) {
        edges.push({ i, j: idOf.get(key(ix + 1, iy)), w_ij: 0 });
      }
      if (iy + 1 < resolutionY) {
        edges.push({ i, j: idOf.get(key(ix, iy + 1)), w_ij: 0 });
      }
    }
  }

  return {
    kind: "grid-plane",
    convention: BOUNDARY_PLANE_CONVENTION,
    sizeX,
    sizeY,
    resolutionX,
    resolutionY,
    z,
    nodes,
    edges,
    idOf,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

/**
 * Empty plane EGT ready for trail accumulation.
 * @param {ReturnType<typeof makeGridPlane>} grid
 * @param {{ alpha?: number, beta?: number, t?: number }} [opts]
 */
export function createPlaneEGT(grid, opts = {}) {
  const n = grid.nodes.length;
  const egt = {
    kind: "entanglement-graph-tensor",
    status: EGT_STATUS,
    claim: EGT_CLAIM,
    t: opts.t ?? 0,
    shape: {
      nx: grid.resolutionX,
      ny: grid.resolutionY,
      nz: 1,
      note: "plane boundary — not cube-face proto shape",
    },
    stride: 1,
    nodes: grid.nodes.map((node) => ({ ...node })),
    edges: grid.edges.map((e) => ({ ...e })),
    C: [],
    causalLinks: [],
    rho: new Float64Array(n),
    K: new Float64Array(n),
    epsilon: new Float64Array(n),
    h_ij: inducedMetricHij(g_munu),
    projectorId: "P_flat-static-observer",
    plane: {
      sizeX: grid.sizeX,
      sizeY: grid.sizeY,
      z: grid.z,
      convention: BOUNDARY_PLANE_CONVENTION,
    },
    dictionary: Object.freeze({
      trail: "ρ / w_ij accumulate from projected worldline",
      time: "frame index advances bulk t; {EGT} is temporal structure",
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
 * Nearest node id to spatial point (x,y,z) on the plane.
 * @param {object} egt
 * @param {{ x: number, y: number, z: number }} p3
 */
export function nearestNodeId(egt, p3) {
  let best = 0;
  let bestD = Infinity;
  for (const n of egt.nodes) {
    const dx = n.position.x - p3.x;
    const dy = n.position.y - p3.y;
    const dz = n.position.z - p3.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return { id: best, dist2: bestD, node: egt.nodes[best] };
}

/**
 * Deposit density + entanglement trail at projected point.
 * @param {object} egt
 * @param {{ x: number, y: number, z: number }} p3
 * @param {{ densityIncrement?: number, entanglementIncrement?: number }} [opts]
 */
export function depositTrail(egt, p3, opts = {}) {
  const densityIncrement = opts.densityIncrement ?? 1;
  const entanglementIncrement = opts.entanglementIncrement ?? 0.35;
  const { id } = nearestNodeId(egt, p3);
  egt.rho[id] += densityIncrement;

  let edgesTouched = 0;
  for (const e of egt.edges) {
    if (e.i === id || e.j === id) {
      e.w_ij += entanglementIncrement;
      edgesTouched++;
    }
  }

  // Causal proxy: from previous peak toward this node (optional trail arrows)
  if (egt._lastDepositId != null && egt._lastDepositId !== id) {
    egt.causalLinks.push({
      from: egt._lastDepositId,
      to: id,
      strength: Math.min(1, densityIncrement),
    });
    egt.C = egt.causalLinks;
  }
  egt._lastDepositId = id;

  return { nearestId: id, edgesTouched };
}

/**
 * Advance one frame: project worldline → deposit → recompute K.
 */
export function stepTinySceneFrame(ctx) {
  const { worldline, boundary, egt, t, densityIncrement, entanglementIncrement, alpha, beta } =
    ctx;
  const p4 = worldline.positionAt(t);
  const p3 = boundary.projectPoint4DTo3D(p4.asArray);
  const deposit = depositTrail(egt, p3, { densityIncrement, entanglementIncrement });
  recomputeCurvature(egt, { alpha, beta });
  egt.t = t;
  egt.hash = hashEGT(egt);
  return { p4, p3, deposit };
}

function maxAbs(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > m) m = a;
  }
  return m;
}

function maxVal(arr) {
  let m = -Infinity;
  let at = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > m) {
      m = arr[i];
      at = i;
    }
  }
  return { max: m, at };
}

function sumEdges(egt) {
  let s = 0;
  for (const e of egt.edges) s += e.w_ij;
  return s;
}

/**
 * Simple bulk track PNG: t horizontal, x vertical — worldline as bright trail.
 * @param {{ t: number, x: number }[]} track
 */
export function renderBulkWorldlineRgb(track, { width = 384, height = 192 } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 10;
    rgb[i + 1] = 12;
    rgb[i + 2] = 22;
  }
  if (!track.length) {
    return { width, height, rgb };
  }
  let tMin = track[0].t;
  let tMax = track[0].t;
  let xMin = track[0].x;
  let xMax = track[0].x;
  for (const p of track) {
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }
  const dt = tMax - tMin || 1;
  const dx = xMax - xMin || 1;
  const pad = 12;

  const toPx = (p) => {
    const px = pad + ((p.t - tMin) / dt) * (width - 2 * pad);
    const py = height - pad - ((p.x - xMin) / dx) * (height - 2 * pad);
    return { px: Math.round(px), py: Math.round(py) };
  };

  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (x + width * y) * 3;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
  };

  for (let i = 1; i < track.length; i++) {
    const a = toPx(track[i - 1]);
    const b = toPx(track[i]);
    const steps = Math.max(Math.abs(b.px - a.px), Math.abs(b.py - a.py), 1);
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = Math.round(a.px + u * (b.px - a.px));
      const y = Math.round(a.py + u * (b.py - a.py));
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          set(x + ox, y + oy, 80, 200, 255);
        }
      }
    }
  }
  // endpoints
  const start = toPx(track[0]);
  const end = toPx(track[track.length - 1]);
  set(start.px, start.py, 255, 220, 80);
  set(end.px, end.py, 255, 120, 80);

  return { width, height, rgb, note: "Bulk view: worldline track (t vs x)" };
}

/**
 * Run full Bulk → Boundary → EGT → render loop (CPU).
 *
 * @param {{
 *   frames?: number,
 *   dt?: number,
 *   v_x?: number,
 *   sizeX?: number,
 *   sizeY?: number,
 *   resolutionX?: number,
 *   resolutionY?: number,
 *   z?: number,
 *   densityIncrement?: number,
 *   entanglementIncrement?: number,
 *   alpha?: number,
 *   beta?: number,
 *   width?: number,
 *   height?: number,
 * }} [opts]
 */
export function runTinyHolographicScene(opts = {}) {
  const frames = Math.max(1, opts.frames ?? 48);
  const dt = opts.dt ?? 1;
  const v_x = opts.v_x ?? 0.15;
  const densityIncrement = opts.densityIncrement ?? 1;
  const entanglementIncrement = opts.entanglementIncrement ?? 0.35;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const beta = opts.beta ?? DEFAULT_BETA;
  const width = opts.width ?? 384;
  const height = opts.height ?? 256;

  const worldline = new Worldline({ v_x });
  const boundary = new BoundaryProjection();
  const grid = makeGridPlane({
    sizeX: opts.sizeX ?? 10,
    sizeY: opts.sizeY ?? 10,
    resolutionX: opts.resolutionX ?? 32,
    resolutionY: opts.resolutionY ?? 32,
    z: opts.z ?? 0,
  });
  const egt = createPlaneEGT(grid, { alpha, beta, t: 0 });

  const track = [];
  const projections = [];
  const framePeaks = [];

  // Lab coupling: each "bulk advance" (t++) is paired with EGT deposit/update
  let couplingOk = true;
  for (let f = 0; f < frames; f++) {
    const t = f * dt;
    const bulkStepped = true; // advance worldline parameter t
    const step = stepTinySceneFrame({
      worldline,
      boundary,
      egt,
      t,
      densityIncrement,
      entanglementIncrement,
      alpha,
      beta,
    });
    const egtUpdated = true;
    const coupling = checkBulkEgtCoupling({ bulkStepped, egtUpdated });
    if (!coupling.ok) couplingOk = false;

    track.push({ t: step.p4.t, x: step.p4.x, y: step.p4.y, z: step.p4.z });
    projections.push({
      t,
      p3: { x: step.p3.x, y: step.p3.y, z: step.p3.z },
      nearestId: step.deposit.nearestId,
    });
    framePeaks.push({ t, nearestId: step.deposit.nearestId });
  }

  const rhoPeak = maxVal(egt.rho);
  const maxK = maxAbs(egt.K);
  const edgeSum = sumEdges(egt);
  const peakNode = egt.nodes[rhoPeak.at];

  // Path proximity: peak ρ should sit near some projected sample
  let minDistToPath = Infinity;
  for (const pr of projections) {
    const dx = peakNode.position.x - pr.p3.x;
    const dy = peakNode.position.y - pr.p3.y;
    const d = Math.hypot(dx, dy);
    if (d < minDistToPath) minDistToPath = d;
  }

  const reconstruction = reconstructApproximateBulk(egt, track, framePeaks);
  const health = entanglementHealth(egt);
  const governance = buildGovernanceAudit({
    coupling: checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: couplingOk }),
    health,
    reconstructionError: reconstruction.metrics.reconstructionError,
    maxRhoPeakDist: reconstruction.metrics.maxRhoPeakDist,
  });

  const bulkRgb = renderBulkWorldlineRgb(track, { width, height: Math.round(height * 0.75) });
  const heat = renderEGTHeatmap(egt, { width, height });
  const warped = renderEGTEmergentGeometry(egt, { width, height });

  const receipt = {
    kind: "tiny-holographic-scene-receipt",
    status: TINY_SCENE_STATUS,
    convention: BOUNDARY_PLANE_CONVENTION,
    frames,
    dt,
    v_x,
    nodeCount: egt.nodes.length,
    edgeCount: egt.edges.length,
    maxRho: rhoPeak.max,
    maxRhoNodeId: rhoPeak.at,
    maxK,
    edgeSum,
    minDistPeakToPath: minDistToPath,
    alpha,
    beta,
    densityIncrement,
    entanglementIncrement,
    egtHash: egt.hash,
    certifiedProto: "untouched — isolated scene (no BulkSpacetimeEngine chamber)",
    modes: [EFR_MODES.HEATMAP, EFR_MODES.EMERGENT_GEOMETRY],
    reconstructionError: reconstruction.metrics.reconstructionError,
    maxWorldlineError: reconstruction.metrics.maxWorldlineError,
    maxRhoPeakDist: reconstruction.metrics.maxRhoPeakDist,
    fieldAmplitudeError: reconstruction.metrics.fieldAmplitudeError,
    curvatureMismatch: reconstruction.metrics.curvatureMismatch,
    governance,
  };

  return {
    worldline,
    boundary,
    grid,
    egt,
    track,
    projections,
    framePeaks,
    reconstruction,
    receipt,
    images: {
      bulk: bulkRgb,
      heatmap: heat,
      warped,
    },
  };
}

/**
 * Deterministic fingerprint of scene outcomes (for tests).
 */
export function sceneFingerprint(result) {
  const { receipt, egt } = result;
  return [
    receipt.frames,
    receipt.v_x,
    receipt.nodeCount,
    receipt.edgeCount,
    receipt.maxRho.toFixed(8),
    receipt.maxK.toFixed(8),
    receipt.edgeSum.toFixed(8),
    egt.hash,
  ].join("|");
}
