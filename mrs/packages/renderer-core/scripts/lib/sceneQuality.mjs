/**
 * Scene-spec RT4D still quality helpers (noise / AA / color).
 *
 * STATUS:
 *   - stratified jitter: **enforced** (deterministic with seeded rng)
 *   - adaptive sampling: **enforced** when enabled + covered by tests
 *   - firefly clamp: **enforced**
 *   - tonemap encode: **enforced** (reuses proton applyTonemap)
 *
 * Trail: docs/governance/cecp/trails/cinematic-render-quality-2026-07/
 */

import { applyTonemap } from "../../src/render/rt4d/proton/tonemap.js";

/**
 * Stratified pixel jitter in [0,1)² for sample index `s` of `nSamples`.
 * @param {number} s
 * @param {number} nSamples
 * @param {() => number} rng
 * @returns {[number, number]}
 */
export function stratifiedJitter2d(s, nSamples, rng) {
  const n = Math.max(1, nSamples | 0);
  const grid = Math.max(1, Math.ceil(Math.sqrt(n)));
  const sx = s % grid;
  const sy = Math.floor(s / grid) % grid;
  const u = (sx + rng()) / grid;
  const v = (sy + rng()) / grid;
  return [Math.min(0.999999, u), Math.min(0.999999, v)];
}

/**
 * Clamp HDR sample to limit fireflies (per-channel).
 * @param {{x:number,y:number,z:number}} L
 * @param {number} maxVal
 */
export function clampFirefly(L, maxVal = 16) {
  const m = Math.max(0, maxVal);
  return {
    x: Math.min(m, Math.max(0, L.x)),
    y: Math.min(m, Math.max(0, L.y)),
    z: Math.min(m, Math.max(0, L.z)),
  };
}

/**
 * Online luminance variance; stop early when converged.
 * @param {object} opts
 * @param {number} opts.minSamples
 * @param {number} opts.maxSamples
 * @param {number} [opts.varianceThreshold]
 * @param {(s:number)=> {x:number,y:number,z:number}} opts.sampleFn
 * @returns {{ r:number, g:number, b:number, samplesUsed:number, earlyStop:boolean }}
 */
export function accumulateAdaptive(opts) {
  const maxSamples = Math.max(1, opts.maxSamples | 0);
  const minSamples = Math.min(maxSamples, Math.max(1, opts.minSamples | 0));
  const thresh =
    typeof opts.varianceThreshold === "number" && opts.varianceThreshold > 0
      ? opts.varianceThreshold
      : 0.0025;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLum = 0;
  let sumLumSq = 0;
  let earlyStop = false;
  let s = 0;

  for (; s < maxSamples; s++) {
    const L = opts.sampleFn(s);
    sumR += L.x;
    sumG += L.y;
    sumB += L.z;
    const lum = 0.2126 * L.x + 0.7152 * L.y + 0.0722 * L.z;
    sumLum += lum;
    sumLumSq += lum * lum;

    if (s + 1 >= minSamples) {
      const n = s + 1;
      const mean = sumLum / n;
      const varEst = Math.max(0, sumLumSq / n - mean * mean);
      const rel = varEst / (mean * mean + 1e-4);
      if (rel < thresh) {
        earlyStop = true;
        s += 1;
        break;
      }
    }
  }

  const n = Math.max(1, s);
  return {
    r: sumR / n,
    g: sumG / n,
    b: sumB / n,
    samplesUsed: n,
    earlyStop,
  };
}

/**
 * Encode linear HDR RGB → 8-bit with exposure + tonemap + gamma.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {{ exposure?: number, tonemap?: string, gamma?: number }} [opts]
 * @returns {[number, number, number]}
 */
export function encodeBeautyRgb(r, g, b, opts = {}) {
  const exposure =
    typeof opts.exposure === "number" && Number.isFinite(opts.exposure)
      ? opts.exposure
      : 1.35;
  const mode =
    opts.tonemap === "reinhard" ||
    opts.tonemap === "aces-lite" ||
    opts.tonemap === "none"
      ? opts.tonemap
      : "aces-lite";
  const gamma =
    typeof opts.gamma === "number" && opts.gamma > 0 ? opts.gamma : 2.2;

  const buf = applyTonemap(new Float32Array([r, g, b, 1]), {
    mode,
    exposure,
    gamma,
  });
  return [
    Math.min(255, Math.max(0, Math.round(buf[0] * 255))),
    Math.min(255, Math.max(0, Math.round(buf[1] * 255))),
    Math.min(255, Math.max(0, Math.round(buf[2] * 255))),
  ];
}
