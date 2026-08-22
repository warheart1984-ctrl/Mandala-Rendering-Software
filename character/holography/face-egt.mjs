/**
 * Boundary-encoded facial rigs (partial).
 *
 * Expression = ρ / w / causal pattern on a face patch (not blendshape sliders).
 * Production character face retopo = **declared**.
 * Status: **partial**
 */

import { createHash } from "node:crypto";
import {
  DEFAULT_ALPHA,
  DEFAULT_BETA,
  EGT_CLAIM,
  EGT_STATUS,
  hashEGT,
  recomputeCurvature,
} from "../../mandala/holography/egt.mjs";
import { inducedMetricHij, g_munu } from "../../mandala/holography/projector.mjs";

export const FACE_EGT_STATUS = "partial";
export const FACE_RETOPO_STATUS = "declared";

/** High-level expression → region controlInfluence weights */
export const EXPRESSION_INFLUENCE = Object.freeze({
  smile: {
    mouth: 0.9,
    cheek: 0.75,
    eye: 0.35,
    brow: 0.15,
    jaw: 0.1,
    nose: 0.05,
  },
  anger: {
    brow: 0.95,
    eye: 0.5,
    mouth: 0.4,
    jaw: 0.35,
    nose: 0.25,
    cheek: 0.2,
  },
  surprise: {
    brow: 0.9,
    eye: 0.85,
    mouth: 0.55,
    jaw: 0.4,
    cheek: 0.15,
    nose: 0.1,
  },
  neutral: {
    brow: 0,
    eye: 0,
    mouth: 0,
    jaw: 0,
    cheek: 0,
    nose: 0,
  },
});

const FIBER_TAGS = Object.freeze({
  zygomaticus: "zygomaticus",
  orbicularis: "orbicularis",
  frontalis: "frontalis",
  fascia: "fascia",
});

function zoneFamily(region) {
  if (!region) return "other";
  if (region.startsWith("brow")) return "brow";
  if (region.startsWith("eye")) return "eye";
  if (region.startsWith("nose")) return "nose";
  if (region.startsWith("mouth") || region === "lip") return "mouth";
  if (region.startsWith("cheek") || region.startsWith("zygomaticus")) return "cheek";
  if (region.startsWith("jaw")) return "jaw";
  if (region.startsWith("nasolabial")) return "cheek";
  return "other";
}

/**
 * Procedural face patch — used when character mesh has no facial resolution.
 */
export function buildFacePatch(opts = {}) {
  const resU = Math.max(5, opts.resU ?? 12);
  const resV = Math.max(5, opts.resV ?? 10);
  const width = opts.width ?? 0.24;
  const height = opts.height ?? 0.3;
  const nodes = [];
  const idOf = new Map();
  const key = (iu, iv) => `${iu},${iv}`;

  function regionAt(u, v) {
    if (v < 0.16) return "jaw";
    if (v > 0.82 && u < 0.4) return "brow_L";
    if (v > 0.82 && u > 0.6) return "brow_R";
    if (v > 0.82) return "brow_C";
    if (v > 0.58 && v < 0.74 && u > 0.38 && u < 0.62) return "nose";
    if (v > 0.55 && v < 0.72 && u < 0.36) return "eye_L";
    if (v > 0.55 && v < 0.72 && u > 0.64) return "eye_R";
    if (v > 0.2 && v < 0.4 && u > 0.34 && u < 0.66) return "mouth";
    if (v > 0.26 && v < 0.52 && u < 0.32) return "nasolabial_L";
    if (v > 0.26 && v < 0.52 && u > 0.68) return "nasolabial_R";
    if (v > 0.32 && v < 0.6 && u < 0.26) return "zygomaticus_L";
    if (v > 0.32 && v < 0.6 && u > 0.74) return "zygomaticus_R";
    if (u < 0.5) return "cheek_L";
    return "cheek_R";
  }

  for (let iv = 0; iv < resV; iv++) {
    for (let iu = 0; iu < resU; iu++) {
      const u = iu / (resU - 1);
      const v = iv / (resV - 1);
      const x = (u - 0.5) * width;
      const y = v * height;
      const z = 0.045 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      const id = nodes.length;
      idOf.set(key(iu, iv), id);
      const region = regionAt(u, v);
      const zone = zoneFamily(region);
      nodes.push({
        id,
        iu,
        iv,
        u,
        v,
        x: u,
        y: v,
        faceId: "face-patch",
        faceIdx: 0,
        position: { x, y, z },
        region,
        zone,
        control: zone === "jaw" || zone === "brow" || zone === "cheek",
        lidEdge:
          zone === "eye" &&
          (Math.abs(v - 0.63) < 0.04 || Math.abs(u - (u < 0.5 ? 0.22 : 0.78)) < 0.06),
        lipEdge: zone === "mouth" && (v < 0.28 || v > 0.36 || u < 0.4 || u > 0.6),
      });
    }
  }

  const edges = [];
  for (let iv = 0; iv < resV; iv++) {
    for (let iu = 0; iu < resU; iu++) {
      const i = idOf.get(key(iu, iv));
      const ni = nodes[i];
      if (iu + 1 < resU) {
        const j = idOf.get(key(iu + 1, iv));
        edges.push(makeFaceEdge(ni, nodes[j], i, j));
      }
      if (iv + 1 < resV) {
        const j = idOf.get(key(iu, iv + 1));
        edges.push(makeFaceEdge(ni, nodes[j], i, j));
      }
    }
  }

  return {
    kind: "face-patch",
    status: FACE_EGT_STATUS,
    faceRetopo: FACE_RETOPO_STATUS,
    note: "Procedural face patch — production character face retopo is declared",
    resU,
    resV,
    nodes,
    edges,
    idOf,
  };
}

function makeFaceEdge(a, b, i, j) {
  const sameZone = a.zone === b.zone;
  let w = sameZone ? 0.55 : 0.28;
  let fiber = FIBER_TAGS.fascia;
  if (a.lidEdge && b.lidEdge) {
    w = 0.85;
    fiber = FIBER_TAGS.orbicularis;
  }
  if (a.lipEdge && b.lipEdge) {
    w = 0.8;
    fiber = FIBER_TAGS.orbicularis;
  }
  if (
    (a.zone === "cheek" && b.zone === "mouth") ||
    (b.zone === "cheek" && a.zone === "mouth") ||
    String(a.region).includes("zygomaticus") ||
    String(b.region).includes("zygomaticus")
  ) {
    w = Math.max(w, 0.65);
    fiber = FIBER_TAGS.zygomaticus;
  }
  if ((a.zone === "brow" || b.zone === "brow") && sameZone) {
    w = Math.max(w, 0.6);
    fiber = FIBER_TAGS.frontalis;
  }
  return { i, j, w_ij: w, fiber, sameZone };
}

export function buildFaceEGT(patch, opts = {}) {
  const n = patch.nodes.length;
  const rho = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    rho[i] = 0.18 + 0.04 * Math.sin(patch.nodes[i].u * 5) * Math.cos(patch.nodes[i].v * 4);
  }
  const causalLinks = [];
  for (const e of patch.edges) {
    if (patch.nodes[e.i].v <= patch.nodes[e.j].v) {
      causalLinks.push({ from: e.i, to: e.j, strength: 0.12 });
    } else {
      causalLinks.push({ from: e.j, to: e.i, strength: 0.12 });
    }
  }
  const egt = {
    kind: "face-entanglement-graph-tensor",
    status: FACE_EGT_STATUS,
    faceRetopo: FACE_RETOPO_STATUS,
    expression: "neutral",
    egtStatus: EGT_STATUS,
    egtClaim: EGT_CLAIM,
    t: opts.t | 0,
    nodes: patch.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: patch.edges.map((e) => ({ ...e })),
    C: causalLinks,
    causalLinks,
    rho,
    K: new Float64Array(n),
    epsilon: new Float64Array(n),
    controlInfluence: { ...EXPRESSION_INFLUENCE.neutral },
    h_ij: inducedMetricHij(g_munu),
    projectorId: "P_face-patch",
    dictionary: Object.freeze({
      expression: "boundary ρ/w/causal — not blendshape slider",
      control: "jaw/cheek/brow read boundary state",
      retopo: "production face retopo declared",
    }),
  };
  recomputeCurvature(egt, {
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? DEFAULT_BETA,
  });
  egt.w_sum = Float64Array.from(egt.epsilon);
  egt.hash = hashFaceEGT(egt);
  return egt;
}

export function hashFaceEGT(egt) {
  const h = createHash("sha256");
  h.update("character.holography.face-egt.v2");
  h.update(egt.expression || "neutral");
  for (const e of egt.edges) h.update(`${e.i}-${e.j}:${e.w_ij.toFixed(6)};`);
  for (let i = 0; i < egt.rho.length; i++) h.update(`${egt.rho[i].toFixed(6)};`);
  h.update(hashEGT(egt));
  return h.digest("hex");
}

function idsByZone(egt, zone) {
  return egt.nodes.filter((n) => n.zone === zone).map((n) => n.id);
}

/**
 * Apply expression pattern — not a blendshape slider.
 */
export function applyExpression(egt, expression = "smile", opts = {}) {
  const amount = opts.amount ?? 1;
  const influence = EXPRESSION_INFLUENCE[expression] || EXPRESSION_INFLUENCE.smile;
  const next = {
    ...egt,
    expression,
    rho: Float64Array.from(egt.rho),
    K: new Float64Array(egt.nodes.length),
    epsilon: new Float64Array(egt.nodes.length),
    edges: egt.edges.map((e) => ({ ...e })),
    nodes: egt.nodes.map((n) => ({ ...n, position: { ...n.position } })),
    C: [],
    causalLinks: [],
    controlInfluence: { ...influence },
  };

  for (const n of next.nodes) {
    const w = influence[n.zone] || 0;
    if (w > 0) next.rho[n.id] = Math.min(1, egt.rho[n.id] + amount * w);
  }

  if (expression === "smile") {
    for (const id of idsByZone(egt, "eye")) {
      if (egt.nodes[id].v < 0.64) next.rho[id] = Math.min(1, next.rho[id] + 0.25 * amount);
    }
    for (const e of next.edges) {
      const fi = egt.nodes[e.i];
      const fj = egt.nodes[e.j];
      const smileLine =
        e.fiber === FIBER_TAGS.zygomaticus ||
        String(fi.region).includes("nasolabial") ||
        String(fj.region).includes("nasolabial");
      if (smileLine) e.w_ij = Math.min(1, e.w_ij + 0.35 * amount);
    }
    const mouth = idsByZone(egt, "mouth");
    const eyes = idsByZone(egt, "eye");
    for (const m of mouth) {
      for (const ey of eyes) {
        next.causalLinks.push({ from: m, to: ey, strength: 0.55 * amount });
      }
    }
  }

  next.C = next.causalLinks;
  const controls = readRigControls(next);
  deformFace(next, expression, amount, opts);
  applyControlOffsets(next, controls, amount);

  recomputeCurvature(next, {
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? DEFAULT_BETA,
  });
  next.w_sum = Float64Array.from(next.epsilon);
  next.hash = hashFaceEGT(next);
  next.controls = controls;

  return {
    egt: next,
    controls,
    fingerprint: expressionFingerprint(next),
    status: FACE_EGT_STATUS,
    faceRetopo: FACE_RETOPO_STATUS,
  };
}

export function applySmile(egt, opts = {}) {
  return applyExpression(egt, "smile", opts);
}

export function readRigControls(egt) {
  const zones = ["jaw", "cheek", "brow"];
  const out = {};
  for (const z of zones) {
    const ids = idsByZone(egt, z);
    if (!ids.length) {
      out[z] = 0;
      continue;
    }
    let s = 0;
    for (const id of ids) s += egt.rho[id] + 0.15 * (egt.epsilon?.[id] || 0);
    out[z] = s / ids.length;
  }
  return out;
}

function applyControlOffsets(egt, controls, amount) {
  for (const n of egt.nodes) {
    if (n.zone === "jaw") {
      n.position.y -= 0.01 * (controls.jaw || 0) * amount;
      n.y = n.v - 0.02 * (controls.jaw || 0) * amount;
    }
    if (n.zone === "brow") {
      n.position.y += 0.008 * (controls.brow || 0) * amount;
      n.y = n.v + 0.02 * (controls.brow || 0) * amount;
    }
  }
}

export function deformFace(egt, expression, amount = 1, opts = {}) {
  const smooth = opts.smoothFactor ?? 0.3;
  const n = egt.nodes.length;
  const pos = egt.nodes.map((node) => [node.position.x, node.position.y, node.position.z]);

  if (expression === "smile") {
    for (const node of egt.nodes) {
      if (node.zone !== "mouth") continue;
      const side = node.u < 0.5 ? -1 : 1;
      const rho = egt.rho[node.id];
      pos[node.id][0] += side * 0.014 * rho * amount;
      pos[node.id][1] += 0.012 * rho * amount;
    }
    for (const node of egt.nodes) {
      if (node.zone !== "cheek" && !String(node.region).includes("zygomaticus")) continue;
      const rho = egt.rho[node.id];
      pos[node.id][2] += 0.01 * rho * amount;
      pos[node.id][1] += 0.006 * rho * amount;
    }
    for (const e of egt.edges) {
      if (e.fiber !== FIBER_TAGS.orbicularis) continue;
      const pull = 0.004 * amount * e.w_ij;
      for (const id of [e.i, e.j]) {
        if (egt.nodes[id].lidEdge) pos[id][1] += pull * egt.rho[id];
      }
    }
  }

  const adj = Array.from({ length: n }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push({ j: e.j, w: e.w_ij });
    adj[e.j].push({ j: e.i, w: e.w_ij });
  }
  const smoothed = pos.map((p) => p.slice());
  for (let i = 0; i < n; i++) {
    const nbrs = adj[i];
    if (!nbrs.length) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sw = 0;
    for (const { j, w } of nbrs) {
      sx += pos[j][0] * w;
      sy += pos[j][1] * w;
      sz += pos[j][2] * w;
      sw += w;
    }
    if (sw < 1e-12) continue;
    smoothed[i][0] = pos[i][0] + (sx / sw - pos[i][0]) * smooth;
    smoothed[i][1] = pos[i][1] + (sy / sw - pos[i][1]) * smooth;
    smoothed[i][2] = pos[i][2] + (sz / sw - pos[i][2]) * smooth;
  }

  for (let i = 0; i < n; i++) {
    egt.nodes[i].position = { x: smoothed[i][0], y: smoothed[i][1], z: smoothed[i][2] };
    egt.nodes[i].x = egt.nodes[i].u;
    egt.nodes[i].y = egt.nodes[i].v + (smoothed[i][1] - egt.nodes[i].v * 0.3) * 0.15;
  }
  return egt;
}

export function expressionFingerprint(egt) {
  const h = createHash("sha256");
  h.update("face.expr.fp.v2");
  h.update(egt.expression || "");
  let rhoSum = 0;
  let wSum = 0;
  for (let i = 0; i < egt.rho.length; i++) rhoSum += egt.rho[i];
  for (const e of egt.edges) wSum += e.w_ij;
  h.update(`${rhoSum.toFixed(8)}:${wSum.toFixed(8)}:${(egt.causalLinks || []).length}`);
  const zones = {};
  for (const n of egt.nodes) {
    if (!zones[n.zone]) zones[n.zone] = { s: 0, c: 0 };
    zones[n.zone].s += egt.rho[n.id];
    zones[n.zone].c++;
  }
  for (const z of Object.keys(zones).sort()) {
    h.update(`${z}:${(zones[z].s / zones[z].c).toFixed(6)};`);
  }
  return h.digest("hex");
}

export function assertSmileDiffers(neutralEgt, smileResult) {
  const fpN = expressionFingerprint(neutralEgt);
  const fpS = smileResult.fingerprint;
  const cheekIds = idsByZone(smileResult.egt, "cheek");
  let dRho = 0;
  for (const id of cheekIds) dRho += smileResult.egt.rho[id] - neutralEgt.rho[id];
  const checks = {
    fingerprintDiffers: fpN !== fpS,
    cheekRhoUp: dRho > 0.05,
    causalMouthToEyes: (smileResult.egt.causalLinks || []).some(
      (c) =>
        neutralEgt.nodes[c.from]?.zone === "mouth" &&
        neutralEgt.nodes[c.to]?.zone === "eye",
    ),
  };
  return {
    ok: checks.fingerprintDiffers && checks.cheekRhoUp,
    checks,
    fpNeutral: fpN,
    fpSmile: fpS,
  };
}
