/**
 * Constitutional animation loops (partial).
 *
 * Per frame: Intent → Evidence → Conformance → Stewardship
 *            → update E, ρ, K, positions, CIEMS trace
 *
 * Primitives: breathe + reach + walk (partial); snarl (stub).
 * Status: **partial** — soft CIEMS trace, not CHARTER enforcement.
 */

import { createHash } from "node:crypto";
import { recomputeCurvature, DEFAULT_ALPHA, DEFAULT_BETA } from "./skin-egt.mjs";
import { buildRigNodes } from "./rig-node.mjs";
import {
  attachGovernanceCoords,
  aggregateGovernance,
} from "./rig-ciems.mjs";

export const CONSTITUTIONAL_MOTION_STATUS = "partial";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

function cloneFrameEgt(egt) {
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
    })),
    E_norms: egt.E_norms ? Float64Array.from(egt.E_norms) : undefined,
  };
}

/**
 * Select torso / arm vertex sets from flows or y-bands.
 */
export function selectFlowVerts(egt, flow) {
  const ids = [];
  for (let i = 0; i < egt.nodes.length; i++) {
    const p = egt.nodes[i].position;
    const yOk =
      (flow.torsoYMin == null || p.y >= flow.torsoYMin) &&
      (flow.torsoYMax == null || p.y <= flow.torsoYMax) &&
      (flow.armYMin == null || p.y >= flow.armYMin) &&
      (flow.armYMax == null || p.y <= flow.armYMax);
    if (!yOk) continue;
    if (flow.requireArm && Math.abs(p.x) < 0.15) continue;
    if (flow.centralOnly && Math.abs(p.x) > 0.22) continue;
    ids.push(i);
  }
  return ids;
}

/**
 * One constitutional frame tick.
 * Stages written into ciemsTrace entry.
 */
export function constitutionalFrameStep(egt0, primitive, t, opts = {}) {
  const egt = cloneFrameEgt(egt0);
  const phase = opts.phase ?? 0;
  const amp = opts.amp ?? 0.12;
  const trace = {
    t,
    primitive,
    status: CONSTITUTIONAL_MOTION_STATUS,
    stages: {},
  };

  // 1. Intent — desired motion energy
  const intentSignal =
    primitive === "breathe"
      ? 0.5 + 0.5 * Math.sin(Math.PI * 2 * (t + phase))
      : primitive === "reach"
        ? clamp01(t)
        : primitive === "walk"
          ? 0.55 + 0.45 * Math.sin(Math.PI * 2 * (t + phase))
          : 0;
  trace.stages.intent = { signal: intentSignal };

  // 2. Evidence — observe current ρ / K means on target verts
  const flow = opts.flow || {};
  let verts = opts.vertexIds || selectFlowVerts(egt, flow);
  if (!verts.length) {
    verts = Array.from({ length: Math.min(16, egt.nodes.length) }, (_, i) => i);
  }
  let meanRho = 0;
  let meanK = 0;
  for (const i of verts) {
    meanRho += egt.rho[i];
    meanK += Math.abs(egt.K[i] || 0);
  }
  meanRho /= verts.length;
  meanK /= verts.length;
  trace.stages.evidence = { meanRho, meanK, vertCount: verts.length };

  // 3. Conformance — soft checks (e.g. no joint inversion proxy)
  let conformanceOk = true;
  let confNote = "ok";
  if (opts.noJointInversion !== false) {
    // Proxy: arm/leg verts should not cross extreme x flip vs rest centroid
    let cx = 0;
    for (const i of verts) cx += egt.nodes[i].position.x;
    cx /= verts.length;
    if (Math.abs(cx) > 0.85) {
      conformanceOk = false;
      confNote = "joint-inversion-proxy-warn";
    }
  }
  const conformanceScore = conformanceOk ? 0.7 + 0.2 * intentSignal : 0.25;
  trace.stages.conformance = {
    ok: conformanceOk,
    score: conformanceScore,
    note: confNote,
  };

  // 4. Stewardship — damp extreme ρ collapse / explosion
  const stewardGain = opts.stewardGain ?? 0.85;
  trace.stages.stewardship = { gain: stewardGain, noCollapse: true };

  // 5. Apply primitive field updates
  if (primitive === "breathe") {
    const breathAmp = (opts.amp ?? flow.amp ?? amp) * intentSignal;
    for (const i of verts) {
      egt.rho[i] = clamp01(
        egt.rho[i] * stewardGain + breathAmp * (0.6 + 0.4 * conformanceScore),
      );
      // Subtle radial expand on inhale
      const p = egt.nodes[i].position;
      const s = 1 + breathAmp * 0.015;
      p.x *= s;
      p.z *= s;
      egt.nodes[i].x = p.x + 0.55;
      egt.nodes[i].y = p.y;
    }
    // Boost torso edge weights slightly with breath
    const vset = new Set(verts);
    for (const e of egt.edges) {
      if (vset.has(e.i) && vset.has(e.j)) {
        e.w_ij = Math.min(1, e.w_ij + breathAmp * 0.08);
      }
    }
  } else if (primitive === "reach") {
    const reachT = intentSignal;
    const reachAmp = opts.amp ?? flow.amp ?? 0.2;
    // Prefer +X arm verts
    const armVerts = verts.filter((i) => egt.nodes[i].position.x > 0.12);
    const target = armVerts.length ? armVerts : verts;
    for (const i of target) {
      egt.rho[i] = clamp01(egt.rho[i] * 0.7 + reachT * reachAmp + 0.15);
      const p = egt.nodes[i].position;
      p.x += reachT * reachAmp * 0.08;
      p.y += reachT * reachAmp * 0.03;
      egt.nodes[i].position = p;
      egt.nodes[i].x = p.x + 0.55;
      egt.nodes[i].y = p.y;
    }
    const vset = new Set(target);
    for (const e of egt.edges) {
      if (vset.has(e.i) && vset.has(e.j)) {
        e.w_ij = Math.min(1, e.w_ij + reachT * 0.12);
      }
    }
    verts = target;
  } else if (primitive === "walk") {
    const walkAmp = opts.amp ?? flow.amp ?? 0.12;
    for (let i = 0; i < egt.nodes.length; i++) {
      const p = egt.nodes[i].position;
      const y = p.y;
      if (y > 0.02 && y < 1.08) {
        const side = p.x >= 0 ? 1 : -1;
        const gait = Math.sin(Math.PI * 2 * (2 * t + phase + (side > 0 ? 0 : 0.5)));
        egt.rho[i] = clamp01(0.2 + 0.35 * Math.max(0, gait) + 0.1 * t);
        p.z += 0.03 * gait * walkAmp * 8;
        p.y += 0.006 * Math.abs(gait);
        egt.nodes[i].x = p.x + 0.55;
        egt.nodes[i].y = p.y;
      } else if (y >= 1.1 && y < 1.55) {
        p.z += 0.004 * intentSignal;
        egt.nodes[i].x = p.x + 0.55;
        egt.nodes[i].y = p.y;
      }
    }
    verts = selectFlowVerts(egt, { torsoYMin: 0.12, torsoYMax: 1.08 });
    if (!verts.length) {
      verts = Array.from({ length: Math.min(24, egt.nodes.length) }, (_, i) => i);
    }
  } else if (primitive === "snarl") {
    trace.stages.stub = {
      status: "stub",
      note: "snarl declared stub — not implemented",
    };
  } else {
    throw new Error(`Unknown motion primitive: ${primitive}`);
  }

  recomputeCurvature(egt, {
    alpha: opts.alpha ?? egt0.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? egt0.beta ?? DEFAULT_BETA,
  });
  egt.w_sum = Float64Array.from(egt.epsilon);
  buildRigNodes(egt, { mutate: true });
  attachGovernanceCoords(egt);

  // Bump gov from stage scores
  for (const i of verts) {
    if (!egt.nodes[i].gov) continue;
    egt.nodes[i].gov.intent = clamp01(
      0.5 * egt.nodes[i].gov.intent + 0.5 * intentSignal,
    );
    egt.nodes[i].gov.evidence = clamp01(
      0.5 * egt.nodes[i].gov.evidence + 0.5 * Math.min(1, meanRho + 0.2),
    );
    egt.nodes[i].gov.conformance = clamp01(
      0.4 * egt.nodes[i].gov.conformance + 0.6 * conformanceScore,
    );
    egt.nodes[i].gov.stewardship = clamp01(
      0.5 * egt.nodes[i].gov.stewardship + 0.5 * stewardGain,
    );
  }

  const frameGov = aggregateGovernance(egt);
  trace.stages.frameGovernance = frameGov;
  trace.fingerprint = createHash("sha256")
    .update("constitutional.motion.frame.v1")
    .update(primitive)
    .update(String(t))
    .update(egt.rho)
    .digest("hex");

  return { egt, trace, vertexIds: verts };
}

/**
 * Run a short constitutional loop for a primitive.
 */
export function runConstitutionalLoop(egt0, primitive, frames = 6, opts = {}) {
  const outFrames = [];
  const traces = [];
  let cur = egt0;
  for (let f = 0; f < frames; f++) {
    const t = frames <= 1 ? 1 : f / (frames - 1);
    const step = constitutionalFrameStep(cur, primitive, t, opts);
    outFrames.push(step.egt);
    traces.push(step.trace);
    cur = step.egt;
  }

  // Evidence: breathe should change mean torso ρ
  let rhoChanged = false;
  if (primitive === "breathe" && outFrames.length >= 2) {
    const a = outFrames[0];
    const b = outFrames[Math.floor(outFrames.length / 4)] || outFrames[1];
    let ma = 0;
    let mb = 0;
    const n = Math.min(a.rho.length, b.rho.length);
    for (let i = 0; i < n; i++) {
      ma += a.rho[i];
      mb += b.rho[i];
    }
    rhoChanged = Math.abs(ma - mb) > 1e-6;
  }

  return {
    frames: outFrames,
    traces,
    primitive,
    rhoChanged,
    status: CONSTITUTIONAL_MOTION_STATUS,
    claim:
      "Soft CIEMS motion loop — Intent→Evidence→Conformance→Stewardship; not living organism animation",
  };
}

export function assertBreatheUpdatesRho(result) {
  return {
    ok: result.primitive === "breathe" && result.rhoChanged === true,
    rhoChanged: result.rhoChanged,
    frameCount: result.frames.length,
  };
}
