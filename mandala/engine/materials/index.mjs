/**
 * Temporal / layered material organ (roadmap v0.3).
 * Look is still primitive. Reuses RT4D Lambertian 3ρ/(4π). η from substrate hashNoise4.
 * Status: **partial**
 */

import { hashNoise4 } from "../../substrate/dual-lattice.mjs";
import { idx } from "../../proto/constitution.mjs";

export const MATERIAL_STATUS = "partial";
/** RT4D Lambertian4D.evaluate: scale(albedo, 3/(4π)) — R5. */
export const BRDF_LAMBERTIAN_4D = 3 / (4 * Math.PI);

export const LAYER_SUBSTRATE = "substrate";
export const LAYER_DEFECT = "defect";

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function temporalAlbedo(base, t, phi) {
  const pulse = 0.5 + 0.5 * Math.sin((t | 0) * 0.35 + phi);
  return [
    clamp01(base[0] * (0.72 + 0.28 * pulse)),
    clamp01(base[1] * (0.72 + 0.28 * pulse)),
    clamp01(base[2] * (0.72 + 0.28 * (1 - pulse))),
  ];
}

export function etaAt(x, y, z, t, seed) {
  return hashNoise4(x | 0, y | 0, z | 0, t | 0, seed | 0);
}

export function emissionFromGrad(gradMag, defectMix) {
  return clamp01(gradMag * 1.8 + defectMix * 0.55);
}

export function defectMix(px, py, pz, defect) {
  const dx = px - defect.x;
  const dy = py - defect.y;
  const dz = pz - defect.z;
  const r2 = dx * dx + dy * dy + dz * dz;
  return Math.exp(-r2 / 8);
}

/**
 * Two-layer BSDF: substrate dielectric + defect glow. Primitive, not film PBR.
 */
export function evaluateLayeredBsdf({
  substrateAlbedo,
  defectAlbedo = [1.0, 0.22, 0.12],
  mix,
  cosTheta = 1,
  emission = 0,
}) {
  const m = clamp01(mix);
  const rho = [
    substrateAlbedo[0] * (1 - m) + defectAlbedo[0] * m,
    substrateAlbedo[1] * (1 - m) + defectAlbedo[1] * m,
    substrateAlbedo[2] * (1 - m) + defectAlbedo[2] * m,
  ];
  const brdf = [rho[0] * BRDF_LAMBERTIAN_4D, rho[1] * BRDF_LAMBERTIAN_4D, rho[2] * BRDF_LAMBERTIAN_4D];
  const pdf = cosTheta <= 0 ? 0 : (3 * cosTheta) / (4 * Math.PI);
  return { rho, brdf, pdf, layers: [LAYER_SUBSTRATE, LAYER_DEFECT], emission: clamp01(emission) };
}

export function shadeCell(snapshot, x, y, z) {
  const shape = snapshot.shape;
  const xi = Math.min(shape.nx - 1, Math.max(0, x | 0));
  const yi = Math.min(shape.ny - 1, Math.max(0, y | 0));
  const zi = Math.min(shape.nz - 1, Math.max(0, z | 0));
  const i = idx(xi, yi, zi, shape);
  const phi = snapshot.scalar[i];
  const gx = snapshot.vector[i * 3] || 0;
  const gy = snapshot.vector[i * 3 + 1] || 0;
  const gz = snapshot.vector[i * 3 + 2] || 0;
  const gradMag = Math.hypot(gx, gy, gz);
  const mix = defectMix(xi, yi, zi, snapshot.defect);
  const eta = etaAt(xi, yi, zi, snapshot.t, snapshot.seed);
  const base = snapshot.material?.albedo || [0.82, 0.71, 0.55];
  const temporal = temporalAlbedo(base, snapshot.t, phi + eta * 0.15);
  const emission = emissionFromGrad(gradMag, mix);
  const bsdf = evaluateLayeredBsdf({
    substrateAlbedo: temporal,
    mix,
    emission,
    cosTheta: 1,
  });
  const lum = clamp01(0.5 + phi * 0.25);
  return {
    rgb: [
      clamp01(lum * bsdf.rho[0] + bsdf.emission * 0.35 * mix),
      clamp01(lum * bsdf.rho[1] + bsdf.emission * 0.08 * mix),
      clamp01(lum * bsdf.rho[2] + bsdf.emission * 0.05),
    ],
    phi,
    gradMag,
    mix,
    eta,
    bsdf,
  };
}

export function phiStats(scalar) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < scalar.length; i++) {
    const v = scalar[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sum2 += v * v;
  }
  const n = scalar.length || 1;
  return { min, max, mean: sum / n, mass: sum, rms: Math.sqrt(sum2 / n) };
}

export function meanGradMag(vector, cellCount) {
  let s = 0;
  const n = cellCount || vector.length / 3;
  for (let i = 0; i < n; i++) {
    s += Math.hypot(vector[i * 3] || 0, vector[i * 3 + 1] || 0, vector[i * 3 + 2] || 0);
  }
  return s / n;
}
