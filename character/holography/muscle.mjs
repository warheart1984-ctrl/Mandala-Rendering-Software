/**
 * Entanglement-driven muscle simulation (partial).
 *
 * Data model:
 *   MuscleRegion { id, vertexIds, anchorVertexIds, fiberDir }
 * Per-vertex: ρ, w_ij, K (via skin-egt / mandala/holography recomputeCurvature)
 *
 * Activation → deform (anchors, contraction, bulge, smooth) → ε/K.
 * Status: **partial** — not production biomechanics / “lifelike by default”.
 */

import { createHash } from "node:crypto";
import {
  recomputeCurvature,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
} from "./skin-egt.mjs";
import { selectActivationSeeds } from "./activate.mjs";
import { maybeCurvatureActivate } from "./curvature-activation.mjs";

export const MUSCLE_STATUS = "partial";
export const BIOMECHANICS_STATUS = "declared";

function len3(v) {
  return Math.hypot(v[0], v[1], v[2]) || 1e-12;
}
function norm3(v) {
  const L = len3(v);
  return [v[0] / L, v[1] / L, v[2] / L];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function mix3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

/**
 * @typedef {{ id: number, vertexIds: number[], anchorVertexIds: number[], fiberDir: number[], name?: string }} MuscleRegion
 */

/**
 * Construct a MuscleRegion.
 * @param {{ id?: number, vertexIds: number[], anchorVertexIds?: number[], fiberDir?: number[], name?: string }} spec
 * @returns {MuscleRegion}
 */
export function createMuscleRegion(spec) {
  const vertexIds = [...new Set((spec.vertexIds || []).map((i) => i | 0))];
  const fiberDir = norm3(spec.fiberDir || [0, 1, 0]);
  return {
    id: spec.id ?? 0,
    name: spec.name || `muscle_${spec.id ?? 0}`,
    vertexIds,
    anchorVertexIds: [...new Set((spec.anchorVertexIds || []).map((i) => i | 0))],
    fiberDir,
  };
}

/**
 * Infer fiber direction (PCA power iteration on vertex positions).
 */
export function inferFiberDirection(egt, nodeIds) {
  const pts = nodeIds.map((id) => posArr(egt.nodes[id].position));
  if (pts.length < 2) {
    return { fiberDir: [0, 1, 0], origin: pts[0] || [0, 0, 0] };
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const n = pts.length;
  cx /= n;
  cy /= n;
  cz /= n;
  let vx = 1;
  let vy = 0.2;
  let vz = 0.05;
  for (let iter = 0; iter < 16; iter++) {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const p of pts) {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dz = p[2] - cz;
      const proj = dx * vx + dy * vy + dz * vz;
      ax += proj * dx;
      ay += proj * dy;
      az += proj * dz;
    }
    const L = Math.hypot(ax, ay, az) || 1;
    vx = ax / L;
    vy = ay / L;
    vz = az / L;
  }
  return { fiberDir: [vx, vy, vz], origin: [cx, cy, cz] };
}

/**
 * Build MuscleRegion from skin EGT selection (torso band / arm / custom ids).
 */
export function buildMuscleRegionFromEgt(egt, sel = {}, opts = {}) {
  const seeds = selectActivationSeeds(egt, {
    region: sel.region,
    yMin: sel.yMin,
    yMax: sel.yMax,
    xMin: sel.xMin,
    xMax: sel.xMax,
    vertexIds: sel.vertexIds,
    maxSeeds: sel.maxSeeds ?? 32,
  });
  // Expand seeds by 1 hop for belly coverage
  const adj = new Map();
  for (const e of egt.edges) {
    if (!adj.has(e.i)) adj.set(e.i, []);
    if (!adj.has(e.j)) adj.set(e.j, []);
    adj.get(e.i).push(e.j);
    adj.get(e.j).push(e.i);
  }
  const belly = new Set(seeds);
  for (const s of seeds) {
    for (const j of adj.get(s) || []) belly.add(j);
  }
  const vertexIds = [...belly];
  const { fiberDir, origin } = inferFiberDirection(egt, vertexIds);

  // Anchors: high skin-weight verts near ends of fiber extent (not in belly center)
  const scored = vertexIds.map((id) => {
    const p = posArr(egt.nodes[id].position);
    const along = dot3(sub3(p, origin), fiberDir);
    const topW = egt.nodes[id].boneTop?.weights?.[0] ?? 0.5;
    return { id, along, topW };
  });
  scored.sort((a, b) => a.along - b.along);
  const endN = Math.max(2, Math.floor(scored.length * 0.2));
  const ends = [
    ...scored.slice(0, endN),
    ...scored.slice(-endN),
  ];
  const anchorVertexIds = [
    ...new Set(
      ends
        .filter((x) => x.topW >= (opts.anchorMinWeight ?? 0.35))
        .map((x) => x.id),
    ),
  ];
  // Fallback: take extreme along-fiber verts
  if (anchorVertexIds.length < 2) {
    anchorVertexIds.push(scored[0].id, scored[scored.length - 1].id);
  }

  return createMuscleRegion({
    id: sel.id ?? 1,
    name: sel.name || sel.region || "muscle",
    vertexIds,
    anchorVertexIds,
    fiberDir,
  });
}

/**
 * activationSignal(m, t) ∈ [0,1]
 */
export function activationSignal(muscle, t = 1, opts = {}) {
  const peak = opts.peak ?? 1;
  const phase = opts.phase ?? 0;
  // t=0 rest, t=1 full fire; optional sin envelope
  if (opts.mode === "sin") {
    return Math.max(0, Math.min(1, peak * Math.sin(Math.PI * (t + phase))));
  }
  return Math.max(0, Math.min(1, peak * t));
}

/**
 * Clone EGT for mutation.
 */
function cloneEgt(egt) {
  return {
    ...egt,
    rho: Float64Array.from(egt.rho),
    K: new Float64Array(egt.nodes.length),
    epsilon: new Float64Array(egt.nodes.length),
    edges: egt.edges.map((e) => ({ ...e })),
    nodes: egt.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      boneTop: n.boneTop
        ? { joints: [...n.boneTop.joints], weights: [...n.boneTop.weights] }
        : undefined,
      B_i: n.B_i ? Float64Array.from(n.B_i) : undefined,
    })),
  };
}

/**
 * Activate muscle m at time t: set ρ on vertexIds; boost w along fiber.
 *
 * @param {object} egt
 * @param {MuscleRegion} muscle
 * @param {number} t
 * @param {{ entanglementScale?: number, peak?: number, mode?: string }} [opts]
 */
export function activateMuscle(egt, muscle, t = 1, opts = {}) {
  const scale = opts.entanglementScale ?? 0.45;
  const signal = activationSignal(muscle, t, opts);
  const next = cloneEgt(egt);
  const belly = new Set(muscle.vertexIds);
  const fiber = norm3(muscle.fiberDir);

  for (const i of muscle.vertexIds) {
    if (i >= 0 && i < next.rho.length) next.rho[i] = signal;
  }

  let edgesBoosted = 0;
  let sumDw = 0;
  for (const e of next.edges) {
    if (!belly.has(e.i) || !belly.has(e.j)) continue;
    const pi = posArr(egt.nodes[e.i].position);
    const pj = posArr(egt.nodes[e.j].position);
    const edgeDir = norm3(sub3(pj, pi));
    const align = Math.abs(dot3(edgeDir, fiber));
    const rhoEdge = 0.5 * ((next.rho[e.i] || 0) + (next.rho[e.j] || 0));
    const dw = rhoEdge * align * scale;
    if (dw > 1e-8) {
      e.w_ij = Math.min(1, e.w_ij + dw);
      edgesBoosted++;
      sumDw += dw;
    }
  }

  return {
    egt: next,
    signal,
    edgesBoosted,
    meanDeltaW: edgesBoosted ? sumDw / edgesBoosted : 0,
  };
}

/**
 * Approximate per-vertex normals from neighbor fan.
 */
function estimateNormals(egt, pos) {
  const n = pos.length;
  const normals = Array.from({ length: n }, () => [0, 0, 0]);
  for (const e of egt.edges) {
    const a = pos[e.i];
    const b = pos[e.j];
    const d = sub3(b, a);
    // accumulate edge as weak tangent; normal ≈ away from centroid later
    normals[e.i] = add3(normals[e.i], d);
    normals[e.j] = add3(normals[e.j], scale3(d, -1));
  }
  // Use position relative to local neighbor centroid as outward proxy
  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push(e.j);
    adj[e.j].push(e.i);
  }
  for (let i = 0; i < n; i++) {
    const neigh = adj[i];
    if (!neigh.length) {
      normals[i] = [0, 0, 1];
      continue;
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const j of neigh) {
      cx += pos[j][0];
      cy += pos[j][1];
      cz += pos[j][2];
    }
    cx /= neigh.length;
    cy /= neigh.length;
    cz /= neigh.length;
    normals[i] = norm3([pos[i][0] - cx, pos[i][1] - cy, pos[i][2] - cz]);
  }
  return normals;
}

/**
 * Deform mesh from activated EGT + MuscleRegion.
 * 1. Anchors stay near rest
 * 2. Contraction along fiber
 * 3. Bulge along normal
 * 4. Smooth by w_ij
 */
export function deformMuscle(egt, muscle, restPositions, opts = {}) {
  const contractionScale = opts.contractionScale ?? 0.04;
  const bulgeScale = opts.bulgeScale ?? 0.03;
  const smoothFactor = opts.smoothFactor ?? 0.35;
  const anchorStiffness = opts.anchorStiffness ?? 0.92;
  const iterations = Math.max(1, opts.iterations ?? 4);

  const n = egt.nodes.length;
  const fiber = norm3(muscle.fiberDir);
  const belly = new Set(muscle.vertexIds);
  const anchors = new Set(muscle.anchorVertexIds);
  const rest = restPositions.map((p) => posArr(p).slice());
  const pos = rest.map((p) => p.slice());

  // Muscle centroid for contraction target
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let c = 0;
  for (const id of muscle.vertexIds) {
    ox += rest[id][0];
    oy += rest[id][1];
    oz += rest[id][2];
    c++;
  }
  const origin = c ? [ox / c, oy / c, oz / c] : [0, 0, 0];

  for (let iter = 0; iter < iterations; iter++) {
    const normals = estimateNormals(egt, pos);
    const nextPos = pos.map((p) => p.slice());

    for (const i of muscle.vertexIds) {
      const rho = egt.rho[i] || 0;
      if (rho < 1e-8) continue;

      // 2. Contraction: projectOntoFiber, mix toward proj by rho*contractionScale
      const rel = sub3(pos[i], origin);
      const along = dot3(rel, fiber);
      const proj = add3(origin, scale3(fiber, along * (1 - rho * contractionScale)));
      let p = mix3(pos[i], proj, rho * contractionScale);

      // 3. Bulge: += normal * rho * bulgeScale
      p = add3(p, scale3(normals[i], rho * bulgeScale));
      nextPos[i] = p;
    }

    // 4. Smooth: mix toward weighted neighbor avg by w_ij
    const adjW = Array.from({ length: n }, () => []);
    for (const e of egt.edges) {
      adjW[e.i].push({ j: e.j, w: e.w_ij });
      adjW[e.j].push({ j: e.i, w: e.w_ij });
    }
    for (const i of muscle.vertexIds) {
      if (anchors.has(i)) continue;
      const nbrs = adjW[i];
      if (!nbrs.length) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let sw = 0;
      for (const { j, w } of nbrs) {
        sx += nextPos[j][0] * w;
        sy += nextPos[j][1] * w;
        sz += nextPos[j][2] * w;
        sw += w;
      }
      if (sw < 1e-12) continue;
      const avg = [sx / sw, sy / sw, sz / sw];
      nextPos[i] = mix3(nextPos[i], avg, smoothFactor);
    }

    // 1. Anchors stay near bone/rest attachment
    for (const a of anchors) {
      nextPos[a] = mix3(nextPos[a], rest[a], anchorStiffness);
    }

    for (let i = 0; i < n; i++) pos[i] = nextPos[i];
  }

  return pos;
}

/**
 * Full RT4D-ish loop: control → activate → deform → ε/K.
 *
 * @param {object} egt0 — baseline skin EGT
 * @param {MuscleRegion} muscle
 * @param {number} t — activation time/level
 * @param {object} [opts]
 */
export function fireMuscle(egt0, muscle, t = 1, opts = {}) {
  const rest = egt0.nodes.map((n) => posArr(n.position));
  // Optional curvature→activation path (opts.useCurvatureActivation);
  // default remains classic activationSignal so e2e-showcase stays stable.
  const curv = maybeCurvatureActivate(egt0, muscle, t, opts);
  const act = curv
    ? {
        egt: curv.egt,
        signal: curv.signal,
        edgesBoosted: curv.edgesBoosted,
        meanDeltaW: curv.meanDeltaW,
        curvatureActivation: {
          regionActivation: curv.regionActivation,
          meanK: curv.meanK,
          status: curv.status,
        },
      }
    : activateMuscle(egt0, muscle, t, opts);
  const displaced = deformMuscle(act.egt, muscle, rest, opts);

  const next = act.egt;
  let maxDisp = 0;
  let sumBelly = 0;
  let nBelly = 0;
  let sumAnchor = 0;
  let nAnchor = 0;
  const anchorSet = new Set(muscle.anchorVertexIds);
  const bellySet = new Set(muscle.vertexIds);

  for (let i = 0; i < displaced.length; i++) {
    const d = Math.hypot(
      displaced[i][0] - rest[i][0],
      displaced[i][1] - rest[i][1],
      displaced[i][2] - rest[i][2],
    );
    maxDisp = Math.max(maxDisp, d);
    if (bellySet.has(i) && !anchorSet.has(i)) {
      sumBelly += d;
      nBelly++;
    }
    if (anchorSet.has(i)) {
      sumAnchor += d;
      nAnchor++;
    }
    next.nodes[i].position = {
      x: displaced[i][0],
      y: displaced[i][1],
      z: displaced[i][2],
    };
    next.nodes[i].x = displaced[i][0] + 0.55;
    next.nodes[i].y = displaced[i][1];
  }

  recomputeCurvature(next, {
    alpha: opts.alpha ?? egt0.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? egt0.beta ?? DEFAULT_BETA,
  });
  next.w_sum = Float64Array.from(next.epsilon);

  const meanRho =
    muscle.vertexIds.reduce((s, i) => s + next.rho[i], 0) /
    (muscle.vertexIds.length || 1);
  const baseRho =
    muscle.vertexIds.reduce((s, i) => s + (egt0.rho[i] || 0), 0) /
    (muscle.vertexIds.length || 1);

  const fingerprint = createHash("sha256")
    .update("muscle.region.fire.v2")
    .update(String(muscle.id))
    .update(next.rho)
    .update(String(maxDisp.toFixed(8)))
    .digest("hex");

  return {
    egt: next,
    muscle,
    rest,
    displaced,
    signal: act.signal,
    metrics: {
      status: MUSCLE_STATUS,
      biomechanics: BIOMECHANICS_STATUS,
      meanRho,
      baseMeanRho: baseRho,
      deltaMeanRho: meanRho - baseRho,
      maxDisplacement: maxDisp,
      meanBellyDisplacement: nBelly ? sumBelly / nBelly : 0,
      meanAnchorDisplacement: nAnchor ? sumAnchor / nAnchor : 0,
      edgesBoosted: act.edgesBoosted,
      meanDeltaW: act.meanDeltaW,
      ...(act.curvatureActivation
        ? { curvatureActivation: act.curvatureActivation }
        : {}),
    },
    fingerprint,
  };
}

/**
 * Convenience: build torso or arm muscle and fire.
 */
export function fireNamedMuscle(egt, name = "torso", t = 1, opts = {}) {
  let sel;
  if (name === "biceps" || name === "arm") {
    // Approximate upper-arm band on procedural humanoid
    sel = {
      id: 2,
      name: "biceps",
      region: undefined,
      yMin: 1.15,
      yMax: 1.45,
      // prefer +X arm if positions allow — filter after
      maxSeeds: 28,
    };
  } else {
    sel = {
      id: 1,
      name: "torso_band",
      region: "torso",
      yMin: 1.32,
      yMax: 1.58,
      maxSeeds: 28,
    };
  }
  let muscle = buildMuscleRegionFromEgt(egt, sel, opts);
  if (name === "biceps" || name === "arm") {
    // Keep verts with |x| larger (arm-ish)
    const armish = muscle.vertexIds.filter((id) => {
      const x = Math.abs(egt.nodes[id].position.x);
      return x > 0.18;
    });
    if (armish.length >= 4) {
      muscle = buildMuscleRegionFromEgt(
        egt,
        { id: 2, name: "biceps", vertexIds: armish, maxSeeds: 40 },
        opts,
      );
    }
  }
  return fireMuscle(egt, muscle, t, opts);
}

/**
 * Assert fire increased ρ and |displacement|; anchors move less than belly.
 */
export function assertMuscleFire(result) {
  const m = result.metrics;
  const checks = {
    rhoIncreased: m.deltaMeanRho > 0.05 || m.meanRho > m.baseMeanRho + 0.05,
    nonzeroDisplacement: m.maxDisplacement > 1e-5,
    anchorsMoveLessThanBelly:
      m.meanAnchorDisplacement <= m.meanBellyDisplacement + 1e-9 ||
      m.meanBellyDisplacement > m.meanAnchorDisplacement * 0.5,
  };
  // Prefer strict anchors < belly when both nonzero
  if (m.meanBellyDisplacement > 1e-6 && m.meanAnchorDisplacement >= 0) {
    checks.anchorsMoveLessThanBelly =
      m.meanAnchorDisplacement < m.meanBellyDisplacement;
  }
  return {
    ok:
      checks.rhoIncreased &&
      checks.nonzeroDisplacement &&
      checks.anchorsMoveLessThanBelly,
    checks,
    metrics: m,
  };
}

export { selectActivationSeeds };
