import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { FourVector } from "../constitutional/tensor/index.js";
import { certifyTensor, AUTHORITIES } from "../constitutional/governance/index.js";

export const CLOUD_GRID = { cols: 96, rows: 64 };
export const CLOUD_SEED = 0x5EED4D00 ^ 0xC10D5;

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (t >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWindVector(metric = MetricTensor.minkowski()) {
  // Spacelike wind vector: g(w,w) = 1
  // Slots: (ct=0, s1=0.02, s2=0, s3=0.01)
  return new FourVector(0, 0.02, 0, 0.01, metric);
}

export function certifyWindVector(windVec, metric = MetricTensor.minkowski()) {
  const residual = Math.abs(metric.intervalVec4(windVec) - 1);
  return certifyTensor(windVec, AUTHORITIES.FIELD_ENGINE, [
    { name: "spacelike_wind", residual, tolerance: 1e-9, passed: residual < 1e-9 },
  ]);
}

export function buildCloudNoise(gridW = 96, gridH = 64, seed = CLOUD_SEED) {
  const data = new Float32Array(gridW * gridH);
  const rand = mulberry32(seed);
  for (let i = 0; i < gridW * gridH; i++) {
    data[i] = rand();
  }
  return data;
}

export function advectClouds(noise, windSpatial, tau, gridW = 96, gridH = 64) {
  // windSpatial = [s1, s2] = [0.02, 0] -> advection in s1 direction
  const dx = Math.round(windSpatial[0] * tau * gridW) % gridW;
  const dy = Math.round(windSpatial[1] * tau * gridH) % gridH;
  const advected = new Float32Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const srcX = (x - dx + gridW) % gridW;
      const srcY = (y - dy + gridH) % gridH;
      advected[y * gridW + x] = noise[srcY * gridW + srcX];
    }
  }
  return advected;
}

export function cloudOpacity(advectedNoise, dawn) {
  // Modulate by dawn: fade in during dawn, fade out at night
  const factor = Math.max(0, Math.min(1, (dawn - 0.2) / 0.6)); // smoothstep(dawn, 0.2, 0.8)
  const opacity = new Float32Array(advectedNoise.length);
  for (let i = 0; i < advectedNoise.length; i++) {
    opacity[i] = advectedNoise[i] * factor;
  }
  return opacity;
}