/**
 * 4D material context → mostly-3D BSDF.
 * Status: **enforced** for Lambertian/GGX SoT re-exports;
 * phase color / 4D anisotropy = **partial** hooks; hyper-volume density = **declared**.
 *
 * Not “4D color”: project shading frame to 3D, then evaluate BRDF with
 * audit fixes BRDF = 3ρ/(4π), pdf = 3cosθ/(4π).
 * Hooks must NOT alter those constants — only inputs (albedo / tangent hints).
 */

import { projectToSlice3D } from "./projection.js";
import { normalize, dot, scale, vec4 } from "../math/vec4.js";

export { BSDF4D, Lambertian4D } from "../render/rt4d/material/bsdf4d.js";
export { GGX4D } from "../render/rt4d/material/ggx4d.js";

/**
 * Build a 3D shading frame from a 4D hit + slice.
 * @param {{ position: {x,y,z,w}, normal: {x,y,z,w} }} hit
 * @param {{ n: object, d: number }} hyperplane
 */
export function shadingFrame3D(hit, hyperplane) {
  const { p3, basis } = projectToSlice3D(hyperplane, hit.position);
  const n4 = normalize(hit.normal);
  const n3 = normalize({
    x: dot(basis[0], n4),
    y: dot(basis[1], n4),
    z: dot(basis[2], n4),
    w: 0,
  });
  return {
    position3: p3,
    normal3: { x: n3.x, y: n3.y, z: n3.z },
    basis,
    status: "partial",
  };
}

/**
 * Phase-dependent albedo multiplier f(phase) — typically phase = x·w or slice phase.
 * Modulates RGB only; does not touch BRDF=3ρ/(4π) or pdf.
 * Status: **partial**.
 *
 * @param {{x,y,z,w}|null|undefined} albedo
 * @param {number} [phase=0]
 * @param {{ amplitude?: number, offset?: number }} [opts]
 */
export function phaseAlbedo(albedo, phase = 0, opts = {}) {
  const a = albedo ?? vec4(0.8, 0.8, 0.8, 1);
  const amp = opts.amplitude ?? 0;
  if (amp === 0) return a;
  const m = 1 + amp * Math.cos(phase + (opts.offset ?? 0));
  // Keep non-negative channels; caller should keep amp ≤ 1
  return vec4(Math.max(0, a.x * m), Math.max(0, a.y * m), Math.max(0, a.z * m), a.w);
}

/**
 * Convenience: phase from 4D position (xw product) for f(xw)-style tinting.
 * @param {{x,y,z,w}} p4
 * @param {{x,y,z,w}|null|undefined} albedo
 * @param {{ amplitude?: number, offset?: number, scale?: number }} [opts]
 */
export function phaseAlbedoFromPosition(p4, albedo, opts = {}) {
  const phase = (opts.scale ?? 1) * (p4?.x ?? 0) * (p4?.w ?? 0);
  return phaseAlbedo(albedo, phase, opts);
}

/**
 * 4D anisotropy hint: project the extra axis (default ê_w) into the slice as a tangent.
 * Does not change GGX SoT — consumers may feed tangent3 into a future anisotropic lobe.
 * Status: **partial**.
 *
 * @param {{ position: {x,y,z,w}, normal?: {x,y,z,w} }} hit
 * @param {{ n: object, d: number }} hyperplane
 * @param {{ axis4?: {x,y,z,w}, strength?: number }} [opts]
 */
export function anisotropy4dHint(hit, hyperplane, opts = {}) {
  const axis4 = normalize(opts.axis4 ?? { x: 0, y: 0, z: 0, w: 1 });
  const { basis } = projectToSlice3D(hyperplane, hit.position);
  const t3 = {
    x: dot(basis[0], axis4),
    y: dot(basis[1], axis4),
    z: dot(basis[2], axis4),
  };
  const len = Math.hypot(t3.x, t3.y, t3.z);
  const tangent3 =
    len > 1e-10
      ? { x: t3.x / len, y: t3.y / len, z: t3.z / len }
      : { x: 1, y: 0, z: 0 };
  return {
    tangent3,
    strength: opts.strength ?? 0,
    status: "partial",
    note: "Tangent hint only; anisotropic GGX lobe not wired — use GGX4D isotropic SoT.",
  };
}

/**
 * Hyper-volume density stub ρ₄(p). Status: **declared**.
 * @param {{x,y,z,w}} _p4
 * @param {{ density?: number }} [opts]
 */
export function hyperVolumeDensity(_p4, opts = {}) {
  return {
    density: opts.density ?? 0,
    status: "declared",
    note: "Hyper-volume density not implemented; returns constant stub.",
  };
}

/**
 * 4D anisotropy / phase / volume extension status map.
 */
export const BSDF4D_EXTENSIONS = Object.freeze({
  phaseDependentColor: "partial",
  anisotropy4d: "partial",
  hyperVolumeDensity: "declared",
  note:
    "Use Lambertian4D / GGX4D after shadingFrame3D; phase/anisotropy hooks adjust inputs only. " +
    "BRDF=3ρ/(4π) and pdf=3cosθ/(4π) unchanged.",
});

/** Canonical audit constants (must match normalization.test.js). */
export const BRDF_LAMBERT_FACTOR = 3 / (4 * Math.PI);
export function lambertPdf(cosTheta) {
  return cosTheta <= 0 ? 0 : (3 * cosTheta) / (4 * Math.PI);
}

export function scaleAlbedoLambert(albedo) {
  return scale(albedo, BRDF_LAMBERT_FACTOR);
}
