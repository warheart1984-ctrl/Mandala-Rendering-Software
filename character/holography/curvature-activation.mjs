/**
 * Curvature → muscle activation (partial).
 *
 * ε_i = Σ_j w_ij  (from recomputeCurvature)
 * K_i ≈ α‖∇ε‖ + βΔε
 * MuscleRegion M_k; A_k = σ(mean K over M_k)
 * ρ_i = g(K_i, A_k, fiber alignment)
 *
 * High |K| → higher inferred tension / activation.
 * Status: **partial** — informational proxy, not EMG / biomechanics.
 */

import {
  recomputeCurvature,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
} from "./skin-egt.mjs";

export const CURVATURE_ACTIVATION_STATUS = "partial";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** Local copy — avoid circular import with muscle.mjs */
function activationSignal(muscle, t = 1, opts = {}) {
  const peak = opts.peak ?? 1;
  const phase = opts.phase ?? 0;
  if (opts.mode === "sin") {
    return Math.max(0, Math.min(1, peak * Math.sin(Math.PI * (t + phase))));
  }
  return Math.max(0, Math.min(1, peak * t));
}

function posArr(p) {
  return Array.isArray(p) ? p : [p.x, p.y, p.z];
}

function norm3(v) {
  const L = Math.hypot(v[0], v[1], v[2]) || 1e-12;
  return [v[0] / L, v[1] / L, v[2] / L];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Logistic sigmoid mapped to [0,1] activation.
 * f(x) = 1 / (1 + exp(−gain·(x − midpoint)))
 */
export function activationSigmoid(x, opts = {}) {
  const gain = opts.gain ?? 4;
  const midpoint = opts.midpoint ?? 0;
  return clamp01(1 / (1 + Math.exp(-gain * (x - midpoint))));
}

/**
 * Mean |K| (or signed K) over MuscleRegion vertex ids.
 */
export function meanCurvatureOverRegion(egt, muscle, opts = {}) {
  const ids = muscle.vertexIds || [];
  if (!ids.length) return 0;
  let s = 0;
  for (const i of ids) {
    const k = egt.K?.[i] ?? 0;
    s += opts.signed ? k : Math.abs(k);
  }
  return s / ids.length;
}

/**
 * Region activation A_k = f(mean K over M_k).
 */
export function regionActivationFromCurvature(egt, muscle, opts = {}) {
  const meanK = meanCurvatureOverRegion(egt, muscle, opts);
  const A = activationSigmoid(meanK, {
    gain: opts.gain ?? 4,
    midpoint: opts.midpoint ?? 0.05,
  });
  // Blend with optional explicit control signal t ∈ [0,1]
  const t = opts.t != null ? activationSignal(muscle, opts.t, opts) : 1;
  const blend = opts.blend ?? 0.65;
  return {
    A: clamp01(blend * A + (1 - blend) * t * A),
    meanK,
    controlT: t,
  };
}

/**
 * Per-vertex ρ from curvature, region activation, and fiber alignment.
 *
 * g(K, A, align) = clamp( ρ0·(1−mix) + mix·A·σ(|K|)·(γ + (1−γ)·align) )
 */
export function densityFromCurvatureActivation(K_i, A_k, align, opts = {}) {
  const mix = opts.mix ?? 0.75;
  const gamma = opts.gamma ?? 0.35; // residual iso component
  const rho0 = opts.rho0 ?? 0.15;
  const kAct = activationSigmoid(Math.abs(K_i), {
    gain: opts.kGain ?? 3.5,
    midpoint: opts.kMid ?? 0.02,
  });
  const fiber = gamma + (1 - gamma) * clamp01(align);
  return clamp01(rho0 * (1 - mix) + mix * A_k * kAct * fiber);
}

/**
 * Infer fiber alignment of node i vs muscle fiberDir using neighbor edges.
 */
export function fiberAlignAtNode(egt, i, fiberDir, adj) {
  const fiber = norm3(fiberDir);
  const nbrs = adj[i] || [];
  if (!nbrs.length) return 0.5;
  const pi = posArr(egt.nodes[i].position);
  let best = 0;
  for (const j of nbrs) {
    const pj = posArr(egt.nodes[j].position);
    const d = norm3(sub3(pj, pi));
    best = Math.max(best, Math.abs(dot3(d, fiber)));
  }
  return best;
}

/**
 * Apply curvature-driven activation onto EGT for a MuscleRegion.
 * Does not break fireMuscle: returns activated egt + metrics; optional blend with t.
 *
 * @param {object} egt0
 * @param {object} muscle — MuscleRegion
 * @param {{ t?: number, entanglementScale?: number, recompute?: boolean }} [opts]
 */
export function activateMuscleFromCurvature(egt0, muscle, opts = {}) {
  // Ensure ε/K present
  let egt = egt0;
  if (!egt.K || opts.recompute !== false) {
    // Clone lightly for mutation safety when calling activateMuscle path
    egt = {
      ...egt0,
      rho: Float64Array.from(egt0.rho),
      K: egt0.K ? Float64Array.from(egt0.K) : new Float64Array(egt0.nodes.length),
      epsilon: egt0.epsilon
        ? Float64Array.from(egt0.epsilon)
        : new Float64Array(egt0.nodes.length),
      edges: egt0.edges.map((e) => ({ ...e })),
      nodes: egt0.nodes,
    };
    recomputeCurvature(egt, {
      alpha: opts.alpha ?? egt0.alpha ?? DEFAULT_ALPHA,
      beta: opts.beta ?? egt0.beta ?? DEFAULT_BETA,
    });
  }

  const { A, meanK, controlT } = regionActivationFromCurvature(egt, muscle, opts);

  const adj = Array.from({ length: egt.nodes.length }, () => []);
  for (const e of egt.edges) {
    adj[e.i].push(e.j);
    adj[e.j].push(e.i);
  }

  const nextRho = Float64Array.from(egt.rho);
  const belly = new Set(muscle.vertexIds);
  let sumRho = 0;
  for (const i of muscle.vertexIds) {
    const align = fiberAlignAtNode(egt, i, muscle.fiberDir, adj);
    const rho = densityFromCurvatureActivation(egt.K[i] || 0, A, align, opts);
    nextRho[i] = rho;
    sumRho += rho;
  }

  // Boost edges along fiber (reuse activateMuscle scale semantics)
  const scale = opts.entanglementScale ?? 0.45;
  const fiber = norm3(muscle.fiberDir);
  const nextEdges = egt.edges.map((e) => ({ ...e }));
  let edgesBoosted = 0;
  let sumDw = 0;
  for (const e of nextEdges) {
    if (!belly.has(e.i) || !belly.has(e.j)) continue;
    const pi = posArr(egt.nodes[e.i].position);
    const pj = posArr(egt.nodes[e.j].position);
    const edgeDir = norm3(sub3(pj, pi));
    const align = Math.abs(dot3(edgeDir, fiber));
    const rhoEdge = 0.5 * (nextRho[e.i] + nextRho[e.j]);
    const dw = rhoEdge * align * scale;
    if (dw > 1e-8) {
      e.w_ij = Math.min(1, e.w_ij + dw);
      edgesBoosted++;
      sumDw += dw;
    }
  }

  const next = {
    ...egt,
    rho: nextRho,
    edges: nextEdges,
    K: Float64Array.from(egt.K),
    epsilon: Float64Array.from(egt.epsilon),
  };

  // Recompute K after weight boost (activation feedback)
  recomputeCurvature(next, {
    alpha: opts.alpha ?? egt.alpha ?? DEFAULT_ALPHA,
    beta: opts.beta ?? egt.beta ?? DEFAULT_BETA,
  });
  next.w_sum = Float64Array.from(next.epsilon);

  return {
    egt: next,
    signal: A,
    regionActivation: A,
    meanK,
    controlT,
    edgesBoosted,
    meanDeltaW: edgesBoosted ? sumDw / edgesBoosted : 0,
    meanBellyRho: muscle.vertexIds.length
      ? sumRho / muscle.vertexIds.length
      : 0,
    status: CURVATURE_ACTIVATION_STATUS,
  };
}

/**
 * Optional hook for fireMuscle: when opts.curvatureActivation !== false
 * and opts.useCurvatureActivation === true, seed via curvature path then
 * fall through to existing activate/deform.
 *
 * Returns null if not requested (caller uses classic activateMuscle).
 */
export function maybeCurvatureActivate(egt0, muscle, t, opts = {}) {
  if (!opts.useCurvatureActivation) return null;
  return activateMuscleFromCurvature(egt0, muscle, { ...opts, t });
}

/**
 * Assert activation A rises when mean |K| is artificially raised.
 */
export function assertActivationRisesWithK(egt, muscle) {
  const base = regionActivationFromCurvature(egt, muscle, { t: 1, blend: 1 });
  // Clone K elevated on belly
  const high = {
    ...egt,
    K: Float64Array.from(egt.K),
  };
  for (const i of muscle.vertexIds) {
    high.K[i] = Math.abs(high.K[i]) + 0.8;
  }
  const elev = regionActivationFromCurvature(high, muscle, { t: 1, blend: 1 });
  return {
    ok: elev.A > base.A + 1e-6,
    baseA: base.A,
    elevA: elev.A,
    baseMeanK: base.meanK,
    elevMeanK: elev.meanK,
  };
}
