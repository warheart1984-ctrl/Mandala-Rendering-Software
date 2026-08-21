/**
 * Field ↔ lattice binding for the Simulation Chamber (roadmap v0.4).
 *
 * Binds the certified 32³ substrate (φ = scalar, ∇φ = vector, η = hashNoise4)
 * into the RT4D CPU chamber path in two honest ways:
 *
 *   1. Per-actor local −∇φ transport — each actor samples the certified
 *      gradient at ITS OWN lattice cell (trilinear) and steps by local −∇φ,
 *      instead of every actor sharing one defect delta.
 *
 *   2. A primary-ray FieldVolume composite — a deterministic ray-march of the
 *      certified field along the CAMERA ray, compositing |φ|→fog density,
 *      |∇φ|→emission (low→high colour ramp) and η→IOR/scatter modulation over
 *      the path-traced surface colour.
 *
 * HONEST SCOPE / STATUS: **partial**.
 *   - This is the CPU/JS analogue of the user's GLSL 3D-texture volume shader.
 *   - It is a PRIMARY-RAY single-scatter emission/absorption march (Beer–Lambert
 *     transmittance + emissive field), NOT true multiple-scattering participating
 *     media: surfaces are not lit by the medium and the medium casts no volumetric
 *     shadows. `PathTracer4D._handleVolume` is a homogeneous boundary-scatter shell
 *     and the shipped `Volume4D`/`ExponentialFog` classes expose no `intersect(ray)`,
 *     so heterogeneous media are NOT integrated into secondary bounces here.
 *   - Determinism (P4): fixed-step march, no RNG. Field values come only from the
 *     certified caches + the certified η definition (hashNoise4), so same seed →
 *     same output.
 */

import { vec4 } from "../../../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";
import { PROTO_SHAPE, idx } from "../../proto/constitution.mjs";
import { hashNoise4 } from "../../substrate/dual-lattice.mjs";

/**
 * Default field bounds — the unit cube the task specifies. Chamber world space
 * is mapped into the 32³ lattice through these bounds.
 */
export const DEFAULT_FIELD_BOUNDS = Object.freeze({
  min: Object.freeze([-1, -1, -1]),
  max: Object.freeze([1, 1, 1]),
});

/**
 * Chamber-tuned bounds: a cube centred on the workroom table so the certified
 * well (lattice centre 16,16,16) sits at world ≈ (0, 1.5, 0). Salt-atlas actors
 * spread across x∈[-1.2, 2.4], so actors nearer the well sample a steeper −∇φ
 * and move more than distant ones (the item-2 demonstration). Configurable.
 */
export const CHAMBER_FIELD_BOUNDS = Object.freeze({
  min: Object.freeze([-2.5, 0.0, -2.5]),
  max: Object.freeze([2.5, 3.0, 2.5]),
});

/** Normalisation ranges (user spec): |φ|/1.0, |∇φ|/0.4, η/0.5, clamped [0,1]. */
export const FIELD_NORM = Object.freeze({ phi: 1.0, gradPhi: 0.4, eta: 0.5 });

/** Default FieldVolume params — CPU analogue of the user's JSON volume material. */
export const DEFAULT_FIELD_VOLUME_PARAMS = Object.freeze({
  densityScale: 1.6,
  emissionScale: 1.4,
  gradThreshold: 0.05,
  baseIOR: 1.0,
  etaIORScale: 0.35,
  emissionColorLow: Object.freeze([0.2, 0.6, 1.0]),
  emissionColorHigh: Object.freeze([1.0, 0.8, 0.2]),
  steps: 48,
});

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a chamber world position → fractional 32³ lattice coordinates.
 * Returns clamped continuous coords {x,y,z} in [0, n-1] plus an `inside` flag
 * (true when the world point is within the bounds box before clamping).
 *
 * @param {{x?:number,y?:number,z?:number}|number[]} worldPos
 * @param {number[]} boundsMin [x,y,z]
 * @param {number[]} boundsMax [x,y,z]
 * @param {{nx:number,ny:number,nz:number}} shape
 */
export function worldToLattice(worldPos, boundsMin, boundsMax, shape = PROTO_SHAPE) {
  const wx = Array.isArray(worldPos) ? worldPos[0] : worldPos.x;
  const wy = Array.isArray(worldPos) ? worldPos[1] : worldPos.y;
  const wz = Array.isArray(worldPos) ? worldPos[2] : worldPos.z;
  const spanX = boundsMax[0] - boundsMin[0] || 1e-9;
  const spanY = boundsMax[1] - boundsMin[1] || 1e-9;
  const spanZ = boundsMax[2] - boundsMin[2] || 1e-9;
  const fx = (wx - boundsMin[0]) / spanX;
  const fy = (wy - boundsMin[1]) / spanY;
  const fz = (wz - boundsMin[2]) / spanZ;
  const inside = fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 && fz >= 0 && fz <= 1;
  return {
    x: clamp(fx * (shape.nx - 1), 0, shape.nx - 1),
    y: clamp(fy * (shape.ny - 1), 0, shape.ny - 1),
    z: clamp(fz * (shape.nz - 1), 0, shape.nz - 1),
    inside,
  };
}

/** Trilinear sample of a scalar lattice field at fractional coords. */
export function sampleScalarAt(scalar, lat, shape = PROTO_SHAPE) {
  const x0 = Math.floor(lat.x), y0 = Math.floor(lat.y), z0 = Math.floor(lat.z);
  const x1 = Math.min(x0 + 1, shape.nx - 1);
  const y1 = Math.min(y0 + 1, shape.ny - 1);
  const z1 = Math.min(z0 + 1, shape.nz - 1);
  const tx = lat.x - x0, ty = lat.y - y0, tz = lat.z - z0;
  const g = (x, y, z) => scalar[idx(x, y, z, shape)];
  const c00 = lerp(g(x0, y0, z0), g(x1, y0, z0), tx);
  const c10 = lerp(g(x0, y1, z0), g(x1, y1, z0), tx);
  const c01 = lerp(g(x0, y0, z1), g(x1, y0, z1), tx);
  const c11 = lerp(g(x0, y1, z1), g(x1, y1, z1), tx);
  return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}

/**
 * Trilinear sample of a 3-component (∇φ) vector lattice field.
 * @returns {{x:number,y:number,z:number}}
 */
export function sampleGradientAt(vector, lat, shape = PROTO_SHAPE) {
  const x0 = Math.floor(lat.x), y0 = Math.floor(lat.y), z0 = Math.floor(lat.z);
  const x1 = Math.min(x0 + 1, shape.nx - 1);
  const y1 = Math.min(y0 + 1, shape.ny - 1);
  const z1 = Math.min(z0 + 1, shape.nz - 1);
  const tx = lat.x - x0, ty = lat.y - y0, tz = lat.z - z0;
  const comp = (c) => {
    const g = (x, y, z) => vector[idx(x, y, z, shape) * 3 + c];
    const a00 = lerp(g(x0, y0, z0), g(x1, y0, z0), tx);
    const a10 = lerp(g(x0, y1, z0), g(x1, y1, z0), tx);
    const a01 = lerp(g(x0, y0, z1), g(x1, y0, z1), tx);
    const a11 = lerp(g(x0, y1, z1), g(x1, y1, z1), tx);
    return lerp(lerp(a00, a10, ty), lerp(a01, a11, ty), tz);
  };
  return { x: comp(0), y: comp(1), z: comp(2) };
}

/** Certified η at an integer cell (nearest) — hashNoise4 × etaAmplitude. */
export function etaAt(x, y, z, t, seed, etaAmplitude) {
  return hashNoise4(Math.round(x), Math.round(y), Math.round(z), t, seed) * etaAmplitude;
}

/**
 * Build a per-slice field sampler bound to a certified slice at tNorm.
 * Holds subarray refs (no copy) into the temporal caches.
 *
 * @param {object} field { shape, bounds, scalarCache, vectorCache, filled, seed, etaAmplitude }
 * @param {number} tNorm [0,1]
 * @param {object} [params] FieldVolume params (see DEFAULT_FIELD_VOLUME_PARAMS)
 */
export function createFieldSampler(field, tNorm = 0, params = {}) {
  const shape = field.shape ?? PROTO_SHAPE;
  const bounds = field.bounds ?? CHAMBER_FIELD_BOUNDS;
  const n = shape.cellCount;
  const filled = Math.max(1, field.filled ?? 1);
  // Fractional slice: linearly interpolate the two bracketing certified slices
  // so the bound field evolves smoothly with tNorm (item-3 temporal interp).
  const fs = clamp(tNorm, 0, 1) * (filled - 1);
  const i0 = Math.floor(fs);
  const i1 = Math.min(filled - 1, i0 + 1);
  const w = fs - i0;
  const sliceIdx = Math.round(fs);
  const sliceT = field.sliceTimes ? field.sliceTimes[sliceIdx] ?? sliceIdx : sliceIdx;
  const phi0 = field.scalarCache.subarray(i0 * n, i0 * n + n);
  const phi1 = field.scalarCache.subarray(i1 * n, i1 * n + n);
  const grad0 = field.vectorCache.subarray(i0 * n * 3, i0 * n * 3 + n * 3);
  const grad1 = field.vectorCache.subarray(i1 * n * 3, i1 * n * 3 + n * 3);
  const seed = field.seed ?? 7;
  const etaAmplitude = field.etaAmplitude ?? 0.02;
  const p = { ...DEFAULT_FIELD_VOLUME_PARAMS, ...params };
  const bMin = bounds.min;
  const bMax = bounds.max;

  /** Sample the certified field at a world position (slice-interpolated). */
  function sampleWorld(worldPos) {
    const lat = worldToLattice(worldPos, bMin, bMax, shape);
    if (!lat.inside) return { phi: 0, gradMag: 0, grad: { x: 0, y: 0, z: 0 }, eta: 0, inside: false };
    const phiV = lerp(sampleScalarAt(phi0, lat, shape), sampleScalarAt(phi1, lat, shape), w);
    const g0 = sampleGradientAt(grad0, lat, shape);
    const g1 = sampleGradientAt(grad1, lat, shape);
    const gradV = { x: lerp(g0.x, g1.x, w), y: lerp(g0.y, g1.y, w), z: lerp(g0.z, g1.z, w) };
    const gradMag = Math.hypot(gradV.x, gradV.y, gradV.z);
    const eta = etaAt(lat.x, lat.y, lat.z, sliceT, seed, etaAmplitude);
    return { phi: phiV, gradMag, grad: gradV, eta, inside: true };
  }

  /**
   * Slab-intersect the ray with the field bounds box. Returns [t0,t1] or null.
   */
  function boundsInterval(ray) {
    let t0 = ray.tMin ?? 0.001;
    let t1 = ray.tMax ?? 1e9;
    const o = [ray.origin.x, ray.origin.y, ray.origin.z];
    const d = [ray.direction.x, ray.direction.y, ray.direction.z];
    for (let a = 0; a < 3; a++) {
      const inv = 1 / (d[a] || 1e-12);
      let ta = (bMin[a] - o[a]) * inv;
      let tb = (bMax[a] - o[a]) * inv;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t1 <= t0) return null;
    }
    return [t0, t1];
  }

  /**
   * Composite the field volume over a path-traced surface colour along `ray`.
   * Front-to-back emission/absorption march, occluded by the surface at surfaceT.
   *
   * @param {object} ray primary ray (world space)
   * @param {{x,y,z}} surfaceColor HDR radiance of the surface/background hit
   * @param {number} surfaceT distance to the nearest surface (Infinity if miss)
   * @returns {{x:number,y:number,z:number,w:number}}
   */
  function compositeRay(ray, surfaceColor, surfaceT = Infinity) {
    const iv = boundsInterval(ray);
    if (!iv) return surfaceColor;
    const t0 = Math.max(iv[0], ray.tMin ?? 0.001);
    const t1 = Math.min(iv[1], surfaceT); // do not glow through the surface
    if (!(t1 > t0)) return surfaceColor;

    const steps = Math.max(4, p.steps | 0);
    const dt = (t1 - t0) / steps;
    let transmittance = 1;
    let accR = 0, accG = 0, accB = 0;
    const lowC = p.emissionColorLow;
    const highC = p.emissionColorHigh;

    for (let i = 0; i < steps; i++) {
      const t = t0 + (i + 0.5) * dt;
      const pos = {
        x: ray.origin.x + t * ray.direction.x,
        y: ray.origin.y + t * ray.direction.y,
        z: ray.origin.z + t * ray.direction.z,
      };
      const s = sampleWorld(pos);
      if (!s.inside) continue;

      const dens = clamp(Math.abs(s.phi) / FIELD_NORM.phi, 0, 1) * p.densityScale;
      if (dens <= 1e-5) continue;
      // η → IOR/scatter modulation: subtle brightness gain where the certified
      // stochastic perturbation is positive (honestly small; η amplitude ≈ 0.02).
      const etaN = clamp(Math.abs(s.eta) / FIELD_NORM.eta, 0, 1);
      const iorMod = p.baseIOR + etaN * p.etaIORScale;

      const gradN = clamp(s.gradMag / FIELD_NORM.gradPhi, 0, 1);
      const emit = gradN > p.gradThreshold ? gradN : 0;
      const eR = lerp(lowC[0], highC[0], gradN) * emit * p.emissionScale * iorMod;
      const eG = lerp(lowC[1], highC[1], gradN) * emit * p.emissionScale * iorMod;
      const eB = lerp(lowC[2], highC[2], gradN) * emit * p.emissionScale * iorMod;

      const sigmaStep = dens * dt;
      const absorb = 1 - Math.exp(-sigmaStep);
      // Front-to-back: emission weighted by remaining transmittance.
      accR += transmittance * (eR * absorb + dens * absorb * 0.04 * lowC[0]);
      accG += transmittance * (eG * absorb + dens * absorb * 0.04 * lowC[1]);
      accB += transmittance * (eB * absorb + dens * absorb * 0.04 * lowC[2]);
      transmittance *= Math.exp(-sigmaStep);
      if (transmittance < 1e-3) break;
    }

    return vec4(
      surfaceColor.x * transmittance + accR,
      surfaceColor.y * transmittance + accG,
      surfaceColor.z * transmittance + accB,
      1,
    );
  }

  return {
    status: "partial",
    kind: "primary-ray-field-volume",
    shape,
    bounds,
    sliceIdx,
    sliceT,
    params: p,
    sampleWorld,
    compositeRay,
    boundsInterval,
  };
}

/**
 * PRIORITY 1 — per-actor local −∇φ transport.
 *
 * Each actor samples the certified gradient ∇φ at ITS OWN lattice cell
 * (trilinear) and steps its world position by local −∇φ × scale from rest.
 * Unlike `applyDefectMotionToActors` (one shared defect delta for everyone),
 * actors nearer a φ well sample a steeper gradient and move more.
 *
 * @param {object[]} actors chamber actors (mutated: .position)
 * @param {object} sampler from createFieldSampler
 * @param {{scale?:number}} [opts]
 */
export function applyLocalGradientMotionToActors(actors, sampler, { scale = 6.0 } = {}) {
  for (const actor of actors) {
    const rest = actor._solverRest || actor.position || [0, 0, 0, 0];
    if (!actor._solverRest) actor._solverRest = [...rest];
    const s = sampler.sampleWorld({ x: rest[0], y: rest[1], z: rest[2] });
    // Downhill transport: step along −∇φ.
    actor.position = [
      actor._solverRest[0] - s.grad.x * scale,
      actor._solverRest[1] - s.grad.y * scale,
      actor._solverRest[2] - s.grad.z * scale,
      actor._solverRest[3] || 0,
    ];
    actor._localGradMag = s.gradMag;
    actor.notGradV = false;
  }
  return actors;
}
