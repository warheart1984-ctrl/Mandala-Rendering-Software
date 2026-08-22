/**
 * Explicit 4D→3D projection operator P: R^{1,3} → R^3 (Claim A — computational).
 *
 * SoT for Mandala holography spacetime structure. Boundary encode uses this module
 * for slice geometry; field channels still sample φ on cube faces.
 *
 * Formulas:
 *   ds² = g_μν dx^μ dx^ν
 *   g_μν = diag(−c², 1, 1, 1),  x^μ = (t, x, y, z)
 *
 *   P_naive: drops t — loses causality/time (structure-only / viz contrast)
 *
 *   Induced 3-metric on t = t₀:
 *     h_ij = g_ij − g_0i g_0j / g_00   (flat Minkowski → δ_ij)
 *
 *   Projection tensor with unit timelike normal n (g_μν n^μ n^ν = −1):
 *     h_μν = g_μν + n_μ n_ν
 *     V^μ_proj = h^μ_ν V^ν ,  h^μ_ν = g^{μα} h_αν
 *
 * Flat static observer: n^μ = (1/c, 0, 0, 0), n_μ = (−c, 0, 0, 0)
 * → spatial projection matches P_naive numerically; distances use h_ij not g.
 *
 * Not AdS/CFT. Status: **partial**
 */

/** Default speed of light (natural units). */
export const c = 1;

/**
 * Minkowski metric g_μν = diag(−c², 1, 1, 1), row-major 4×4.
 * Indices: 0=t, 1=x, 2=y, 3=z. Treat as read-only.
 */
export function makeGmunu(cVal = c) {
  const c2 = cVal * cVal;
  return Float64Array.from([
    -c2, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** Default g_μν at c=1. */
export const g_munu = makeGmunu(c);

/** Inverse g^{μν} = diag(−1/c², 1, 1, 1). */
export function makeGmunuInv(cVal = c) {
  const invC2 = 1 / (cVal * cVal);
  return Float64Array.from([
    -invC2, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/**
 * Naive projection matrix P_naive (3×4) acting on column [t,x,y,z]^T:
 *   [[0,1,0,0],[0,0,1,0],[0,0,0,1]]
 * Loses causality/time — insufficient alone for physics.
 */
export const P_NAIVE = Object.freeze([
  Object.freeze([0, 1, 0, 0]),
  Object.freeze([0, 0, 1, 0]),
  Object.freeze([0, 0, 0, 1]),
]);

export const PROJECTOR_IDS = Object.freeze({
  NAIVE: "P_naive-drop-time",
  NORMAL: "P_h-unit-timelike-normal",
  STATIC_OBSERVER: "P_flat-static-observer",
});

function asV4(v) {
  if (Array.isArray(v) || (v && typeof v.length === "number" && v.length >= 4)) {
    return [+v[0], +v[1], +v[2], +v[3]];
  }
  return [
    +(v.t ?? v.w ?? 0),
    +(v.x ?? 0),
    +(v.y ?? 0),
    +(v.z ?? 0),
  ];
}

/**
 * g_μν a^μ b^ν
 */
export function gInner(aUp, bUp, g4 = g_munu) {
  const a = asV4(aUp);
  const b = asV4(bUp);
  let s = 0;
  for (let mu = 0; mu < 4; mu++) {
    for (let nu = 0; nu < 4; nu++) {
      s += g4[mu * 4 + nu] * a[mu] * b[nu];
    }
  }
  return s;
}

/**
 * Lower index: n_μ = g_μν n^ν
 */
export function lowerIndex(nUp, g4 = g_munu) {
  const n = asV4(nUp);
  const out = new Float64Array(4);
  for (let mu = 0; mu < 4; mu++) {
    let s = 0;
    for (let nu = 0; nu < 4; nu++) s += g4[mu * 4 + nu] * n[nu];
    out[mu] = s;
  }
  return out;
}

/**
 * Assert unit timelike: g_μν n^μ n^ν = −1
 */
export function assertNormalUnit(nUp, g4 = g_munu, tol = 1e-12) {
  const nn = gInner(nUp, nUp, g4);
  if (Math.abs(nn + 1) > tol) {
    throw new Error(`assertNormalUnit: g(n,n)=${nn}, expected −1`);
  }
  return true;
}

/**
 * Flat static observer n^μ = (1/c, 0, 0, 0)
 */
export function staticObserverNormal(cVal = c) {
  return Float64Array.from([1 / cVal, 0, 0, 0]);
}

/**
 * P_naive(t,x,y,z) = (x,y,z)
 * Documented: loses causality/time — structure-only / viz.
 */
export function projectNaive(v4) {
  const v = asV4(v4);
  return {
    x: v[1],
    y: v[2],
    z: v[3],
    asArray: Float64Array.from([v[1], v[2], v[3]]),
    projectorId: PROJECTOR_IDS.NAIVE,
    insufficientAlone: true,
    warning:
      "P_naive drops t — loses causality/time; not a holographic dictionary by itself",
  };
}

/**
 * ADM / slice induced 3-metric: h_ij = g_ij − g_0i g_0j / g_00
 * Flat Minkowski → δ_ij.
 *
 * @returns {Float64Array} row-major 3×3
 */
export function inducedMetricHij(g4 = g_munu) {
  if (!g4 || g4.length < 16) {
    throw new Error("inducedMetricHij requires g4 length ≥ 16");
  }
  const g00 = +g4[0];
  if (!Number.isFinite(g00) || Math.abs(g00) < 1e-30) {
    throw new Error(`inducedMetricHij: g_00=${g00} unusable`);
  }
  const h = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const gij = +g4[(i + 1) * 4 + (j + 1)];
      const g0i = +g4[0 * 4 + (i + 1)];
      const g0j = +g4[0 * 4 + (j + 1)];
      h[i * 3 + j] = gij - (g0i * g0j) / g00;
    }
  }
  return h;
}

/**
 * Flat δ_ij on spacelike slice (explicit).
 */
export function flatInducedDelta() {
  return Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

/**
 * Projection tensor h_μν = g_μν + n_μ n_ν (row-major 4×4).
 * Kills components along n; keeps tangent to observer 3-space.
 */
export function projectionTensorH(g4 = g_munu, nUp = staticObserverNormal()) {
  assertNormalUnit(nUp, g4);
  const nDown = lowerIndex(nUp, g4);
  const h = new Float64Array(16);
  for (let mu = 0; mu < 4; mu++) {
    for (let nu = 0; nu < 4; nu++) {
      h[mu * 4 + nu] = g4[mu * 4 + nu] + nDown[mu] * nDown[nu];
    }
  }
  return h;
}

/**
 * Mixed projector h^μ_ν = g^{μα} h_αν
 */
export function projectionTensorHmixed(g4 = g_munu, nUp = staticObserverNormal()) {
  const hDown = projectionTensorH(g4, nUp);
  const gInv = makeGmunuInv(Math.sqrt(Math.abs(-g4[0])) || c);
  // Prefer c from g_00 = −c²
  const cFromG = Math.sqrt(Math.abs(-g4[0]));
  const gInvUse = makeGmunuInv(cFromG || c);
  void gInv;
  const mixed = new Float64Array(16);
  for (let mu = 0; mu < 4; mu++) {
    for (let nu = 0; nu < 4; nu++) {
      let s = 0;
      for (let alpha = 0; alpha < 4; alpha++) {
        s += gInvUse[mu * 4 + alpha] * hDown[alpha * 4 + nu];
      }
      mixed[mu * 4 + nu] = s;
    }
  }
  return mixed;
}

/**
 * Project 4-vector: V^μ_proj = h^μ_ν V^ν
 * Returns full 4-vector (time component killed for static observer) + spatial 3-vector.
 */
export function projectVector(v4, hMixedOrDown, opts = {}) {
  const v = asV4(v4);
  let mixed;
  if (opts.hIsMixed) {
    mixed = hMixedOrDown;
  } else if (opts.g4 && opts.nUp) {
    mixed = projectionTensorHmixed(opts.g4, opts.nUp);
  } else if (hMixedOrDown && hMixedOrDown.length === 16 && opts.assumeMixed) {
    mixed = hMixedOrDown;
  } else {
    // Default: treat as h_μν and raise with default g
    const g4 = opts.g4 || g_munu;
    const nUp = opts.nUp || staticObserverNormal();
    mixed = projectionTensorHmixed(g4, nUp);
  }
  const out = new Float64Array(4);
  for (let mu = 0; mu < 4; mu++) {
    let s = 0;
    for (let nu = 0; nu < 4; nu++) s += mixed[mu * 4 + nu] * v[nu];
    out[mu] = s;
  }
  return {
    v4: out,
    t: out[0],
    x: out[1],
    y: out[2],
    z: out[3],
    spatial: Float64Array.from([out[1], out[2], out[3]]),
    projectorId: PROJECTOR_IDS.NORMAL,
  };
}

/**
 * Project with unit timelike normal: apply h^μ_ν then take spatial components.
 * For flat static observer ≡ projectNaive on (x,y,z).
 */
export function projectWithNormal(v4, nUp = staticObserverNormal(), g4 = g_munu) {
  assertNormalUnit(nUp, g4);
  const mixed = projectionTensorHmixed(g4, nUp);
  const projected = projectVector(v4, mixed, { assumeMixed: true, hIsMixed: true });
  return {
    x: projected.x,
    y: projected.y,
    z: projected.z,
    asArray: projected.spatial,
    v4: projected.v4,
    nUp: asV4(nUp),
    projectorId: PROJECTOR_IDS.NORMAL,
  };
}

/**
 * Convenience: flat static observer projection (matches P_naive spatially).
 */
export function projectStaticObserver(v4, cVal = c) {
  const g4 = makeGmunu(cVal);
  const nUp = staticObserverNormal(cVal);
  const p = projectWithNormal(v4, nUp, g4);
  return { ...p, projectorId: PROJECTOR_IDS.STATIC_OBSERVER, c: cVal };
}

/**
 * Spatial distance on the slice using h_ij (not full g_μν).
 * For flat h=δ: Euclidean |Δx|.
 */
export function spatialDistanceH(dx3, hIj = flatInducedDelta()) {
  const d =
    Array.isArray(dx3) || dx3.length
      ? [+dx3[0], +dx3[1], +dx3[2]]
      : [+dx3.x, +dx3.y, +dx3.z];
  let s2 = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      s2 += hIj[i * 3 + j] * d[i] * d[j];
    }
  }
  return Math.sqrt(Math.max(0, s2));
}

/**
 * Interval using full g_μν (for contrast with slice distance).
 */
export function spacetimeIntervalSquared(dx4, g4 = g_munu) {
  const d = asV4(dx4);
  return gInner(d, d, g4);
}

/**
 * Descriptor stamped onto boundary encode receipts.
 */
export function projectorDescriptor(cVal = c) {
  const g4 = makeGmunu(cVal);
  const nUp = staticObserverNormal(cVal);
  const h4 = projectionTensorH(g4, nUp);
  const hij = inducedMetricHij(g4);
  return {
    status: "partial",
    claim: "A",
    c: cVal,
    g_munu: Array.from(g4),
    nUp: Array.from(nUp),
    nDown: Array.from(lowerIndex(nUp, g4)),
    h_munu: Array.from(h4),
    h_ij: Array.from(hij),
    P_naive: P_NAIVE.map((row) => [...row]),
    note:
      "Boundary faces live on a spacelike slice; P_static ≡ P_naive spatially; time→info is separate (causalStamp).",
    insufficientAlone: {
      naive: true,
      reason: "P_naive / spatial P alone discard temporal structure; holography adds info encoding",
    },
  };
}
