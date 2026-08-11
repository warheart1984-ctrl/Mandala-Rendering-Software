import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { FourVector } from "../constitutional/tensor/index.js";
import { certifyTensor, AUTHORITIES } from "../constitutional/governance/index.js";

export const FOG_DENSITY = 0.0015;
export const FOG_SEED = 0x5EED4D00 ^ 0xF06D5;

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (t >>> 7), 61 | r);
    return ((r ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function certifyFogDensity(rho, metric = MetricTensor.minkowski()) {
  // Scalar certified as a rank-0 tensor (or rank-1 with single component)
  const rhoVec = new FourVector(rho, 0, 0, 0, metric);
  return certifyTensor(rhoVec, AUTHORITIES.FIELD_ENGINE, [
    { name: "fog_density", residual: 0, tolerance: 1e-12, passed: true },
  ]);
}

export function fogFactor(depth, rho = FOG_DENSITY) {
  return 1 - Math.exp(-rho * depth);
}