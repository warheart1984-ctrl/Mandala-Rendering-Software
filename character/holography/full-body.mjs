/**
 * Full-body holographic reconstruction (partial).
 *
 * Global skin EGT + layer weights (skin/muscle/bone) + toy bulk inference.
 * Motion as entanglement evolution: breathing ρ oscillation; optional walk-wave.
 *
 * Status: **partial** — synthetic holographic character layer.
 * NOT “governed reconstructable body” as enforced; NOT “realistic by default”.
 */

import { createHash } from "node:crypto";
import {
  buildSkinEGT,
  recomputeCurvature,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
} from "./skin-egt.mjs";
import { reconstructBonesToy, reconstructMuscleBandsToy } from "./bulk-toy.mjs";

export const FULL_BODY_STATUS = "partial";
export const GOVERNED_BODY_STATUS = "declared";
export const REALISTIC_DEFAULT_STATUS = "declared"; // aspirational marketing only

/**
 * Annotate skin EGT with layer weights + fascia/joint edge tags.
 */
export function annotateBodyLayers(egt) {
  const n = egt.nodes.length;
  const layerSkin = new Float64Array(n);
  const layerMuscle = new Float64Array(n);
  const layerBone = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const topW = egt.nodes[i].boneTop?.weights?.[0] ?? 0.5;
    const jointness = 1 - topW;
    // High exclusive bone weight → bone layer; mid blend → muscle; surface → skin
    layerBone[i] = Math.max(0, Math.min(1, topW * topW));
    layerMuscle[i] = Math.max(0, Math.min(1, 0.35 + 0.5 * jointness + 0.2 * (egt.rho[i] || 0)));
    layerSkin[i] = Math.max(0.2, 1 - 0.5 * layerBone[i]);
    const sum = layerSkin[i] + layerMuscle[i] + layerBone[i] || 1;
    layerSkin[i] /= sum;
    layerMuscle[i] /= sum;
    layerBone[i] /= sum;
    egt.nodes[i].layers = {
      skin: layerSkin[i],
      muscle: layerMuscle[i],
      bone: layerBone[i],
    };
  }

  // Tag edges: muscle / fascia front-back / joint
  for (const e of egt.edges) {
    const ni = egt.nodes[e.i];
    const nj = egt.nodes[e.j];
    const zi = ni.position.z;
    const zj = nj.position.z;
    const sameFront = zi >= 0 && zj >= 0;
    const sameBack = zi < 0 && zj < 0;
    const meanMuscle = 0.5 * (layerMuscle[e.i] + layerMuscle[e.j]);
    const meanBone = 0.5 * (layerBone[e.i] + layerBone[e.j]);
    if (meanBone > 0.45) e.tag = "joint";
    else if (meanMuscle > 0.4) e.tag = "muscle";
    else if (sameFront || sameBack) e.tag = sameFront ? "fascia_front" : "fascia_back";
    else e.tag = "skin";
  }

  egt.layers = { skin: layerSkin, muscle: layerMuscle, bone: layerBone };
  egt.bodyStatus = FULL_BODY_STATUS;
  return egt;
}

/**
 * Build global body EGT from character asset.
 */
export function buildBodyEGT(asset, opts = {}) {
  const egt = buildSkinEGT(asset, opts);
  annotateBodyLayers(egt);
  egt.kind = "body-entanglement-graph-tensor";
  egt.claim =
    "Synthetic holographic character layer (partial) — not governed reconstructable body";
  return egt;
}

/**
 * Toy bulk: bones = high-K low-deformation paths; muscles = high ρ; soft = low-freq.
 */
export function inferBulkToy(egt) {
  const bones = reconstructBonesToy(egt);
  const muscles = reconstructMuscleBandsToy(egt, { topK: 20 });

  // High-K low-ρ edges as bone paths
  const bonePaths = [];
  for (const e of egt.edges) {
    const k = 0.5 * (Math.abs(egt.K[e.i]) + Math.abs(egt.K[e.j]));
    const rho = 0.5 * (egt.rho[e.i] + egt.rho[e.j]);
    const boneL = 0.5 * ((egt.layers?.bone[e.i] || 0) + (egt.layers?.bone[e.j] || 0));
    if (k > 0.15 && rho < 0.55 && boneL > 0.25) {
      bonePaths.push({
        i: e.i,
        j: e.j,
        K: k,
        rho,
        tag: e.tag || "joint",
      });
    }
  }
  bonePaths.sort((a, b) => b.K - a.K);

  // High ρ clusters (muscle)
  const highRho = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    if (egt.rho[i] > 0.45 || (egt.layers?.muscle[i] || 0) > 0.45) {
      highRho.push({ id: i, rho: egt.rho[i], region: egt.nodes[i].region });
    }
  }
  highRho.sort((a, b) => b.rho - a.rho);

  // Soft tissue: low-frequency = low |K| and moderate ρ
  const soft = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    if (Math.abs(egt.K[i]) < 0.2 && egt.rho[i] < 0.4) {
      soft.push({ id: i, K: egt.K[i], rho: egt.rho[i] });
    }
  }

  return {
    kind: "full-body-bulk-toy",
    status: FULL_BODY_STATUS,
    governedBody: GOVERNED_BODY_STATUS,
    realisticDefault: REALISTIC_DEFAULT_STATUS,
    note: "Toy decode from boundary fields — not anatomical solver",
    bones,
    muscles,
    bonePaths: bonePaths.slice(0, 48),
    highRhoMuscles: highRho.slice(0, 64),
    softTissue: { count: soft.length, sample: soft.slice(0, 24) },
  };
}

/**
 * Breathing: ρ oscillation on torso over frames.
 * @returns {{ frames: object[], fingerprints: string[], torsoRho: number[] }}
 */
export function evolveBreathing(egt0, frameCount = 6, opts = {}) {
  const amp = opts.amplitude ?? 0.35;
  const base = opts.base ?? 0.15;
  const frames = [];
  const fingerprints = [];
  const torsoRho = [];

  for (let f = 0; f < frameCount; f++) {
    const t = f / Math.max(1, frameCount - 1);
    const phase = Math.sin(Math.PI * 2 * t);
    const egt = {
      ...egt0,
      t: f,
      rho: Float64Array.from(egt0.rho),
      K: new Float64Array(egt0.nodes.length),
      epsilon: new Float64Array(egt0.nodes.length),
      edges: egt0.edges.map((e) => ({ ...e })),
      nodes: egt0.nodes.map((n) => ({
        ...n,
        position: { ...n.position },
        layers: n.layers ? { ...n.layers } : undefined,
      })),
    };

    let sum = 0;
    let c = 0;
    for (const n of egt.nodes) {
      if (n.region !== "torso") continue;
      const inhale = base + amp * Math.max(0, phase);
      egt.rho[n.id] = Math.min(1, (egt0.rho[n.id] || 0.2) * 0.5 + inhale);
      // mild fascia w boost on front torso during inhale
      sum += egt.rho[n.id];
      c++;
    }
    for (const e of egt.edges) {
      if (e.tag === "fascia_front" || e.tag === "muscle") {
        const ri = egt.nodes[e.i].region;
        const rj = egt.nodes[e.j].region;
        if (ri === "torso" || rj === "torso") {
          e.w_ij = Math.min(1, e.w_ij + 0.08 * Math.max(0, phase));
        }
      }
    }

    // Tiny chest bulge on inhale
    for (const n of egt.nodes) {
      if (n.region !== "torso") continue;
      const d = amp * 0.02 * Math.max(0, phase);
      n.position.z += d * Math.sign(n.position.z || 1) * 0.5 + d * 0.5;
      n.x = n.position.x + 0.55;
      n.y = n.position.y;
    }

    recomputeCurvature(egt, {
      alpha: opts.alpha ?? DEFAULT_ALPHA,
      beta: opts.beta ?? DEFAULT_BETA,
    });
    egt.w_sum = Float64Array.from(egt.epsilon);
    annotateBodyLayers(egt);

    const meanT = c ? sum / c : 0;
    torsoRho.push(meanT);
    const fp = createHash("sha256")
      .update("body.breathe.v1")
      .update(String(f))
      .update(egt.rho)
      .digest("hex");
    fingerprints.push(fp);
    frames.push(egt);
  }

  return {
    kind: "body-breathing-sequence",
    status: FULL_BODY_STATUS,
    frameCount,
    frames,
    fingerprints,
    torsoRho,
  };
}

/**
 * Optional short walk-wave on legs (few frames).
 */
export function evolveWalkWave(egt0, frameCount = 4, opts = {}) {
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const t = f / Math.max(1, frameCount - 1);
    const egt = {
      ...egt0,
      t: f,
      rho: Float64Array.from(egt0.rho),
      K: new Float64Array(egt0.nodes.length),
      epsilon: new Float64Array(egt0.nodes.length),
      edges: egt0.edges.map((e) => ({ ...e })),
      nodes: egt0.nodes.map((n) => ({
        ...n,
        position: { ...n.position },
        layers: n.layers ? { ...n.layers } : undefined,
      })),
    };
    for (const n of egt.nodes) {
      const r = n.region || "";
      if (!r.includes("leg") && !r.includes("thigh") && !r.includes("calf") && n.position.y > 1.0) {
        continue;
      }
      // legs often tagged as limb regions — use y band
      if (n.position.y > 0.2 && n.position.y < 1.05) {
        const side = n.position.x >= 0 ? 1 : -1;
        const wave = Math.sin(Math.PI * 2 * (t + (side > 0 ? 0 : 0.5)));
        egt.rho[n.id] = Math.min(1, 0.2 + 0.4 * Math.max(0, wave));
        n.position.z += 0.02 * wave * side;
        n.x = n.position.x + 0.55;
        n.y = n.position.y;
      }
    }
    recomputeCurvature(egt, {
      alpha: opts.alpha ?? DEFAULT_ALPHA,
      beta: opts.beta ?? DEFAULT_BETA,
    });
    egt.w_sum = Float64Array.from(egt.epsilon);
    frames.push(egt);
  }
  return { kind: "body-walk-wave", status: FULL_BODY_STATUS, frameCount, frames };
}

/**
 * Assert breathing changed torso ρ across frames.
 */
export function assertBreathingChanges(seq) {
  const rhos = seq.torsoRho || [];
  if (rhos.length < 2) return { ok: false, checks: { enoughFrames: false } };
  const min = Math.min(...rhos);
  const max = Math.max(...rhos);
  const fps = new Set(seq.fingerprints || []);
  const checks = {
    enoughFrames: rhos.length >= 2,
    torsoRhoVaries: max - min > 0.02,
    fingerprintsVary: fps.size > 1,
  };
  return { ok: checks.torsoRhoVaries && checks.fingerprintsVary, checks, min, max };
}

export function bodyFingerprint(egt) {
  const h = createHash("sha256");
  h.update("body.egt.fp.v1");
  for (let i = 0; i < egt.rho.length; i++) {
    h.update(`${egt.rho[i].toFixed(6)},${egt.K[i].toFixed(6)};`);
  }
  return h.digest("hex");
}
