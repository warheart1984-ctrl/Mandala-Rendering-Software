/**
 * Kernel 1 — accumulate complex field. CPU models the linear SSBO atomic sum.
 * Baseline contract: atomicAdd(field[i].real, amp*c) and imag (float).
 * GPU dispatch is declared. Polar float atomic is a declared hardware gap.
 */

import {
  LAMBDA_B,
  LAMBDA_G,
  LAMBDA_R,
  createComplexField,
  wavenumber,
} from "./types.js";
import { holoXYFromPixelId } from "./aligned.js";
import { rejectUnreadyPaths } from "./gate.js";

export function radianceMagnitude(radiance) {
  if (typeof radiance === "number") return Math.abs(radiance);
  if (Array.isArray(radiance)) {
    const x = radiance[0] ?? 0;
    const y = radiance[1] ?? 0;
    const z = radiance[2] ?? 0;
    return Math.hypot(x, y, z);
  }
  if (radiance && typeof radiance === "object") {
    return Math.hypot(radiance.x ?? 0, radiance.y ?? 0, radiance.z ?? 0);
  }
  return 0;
}

export function complexContrib(sample, lambda) {
  const k = wavenumber(sample.wl > 0 ? sample.wl : lambda);
  const phase = k * Number(sample.opticalLength ?? 0);
  const amp = radianceMagnitude(sample.radiance) * Number(sample.weight ?? 1);
  return { real: amp * Math.cos(phase), imag: amp * Math.sin(phase), amp, phase };
}

function pixelIndexFromSample(sample, camera, frame) {
  if (Number.isInteger(sample.pixelIndex)) return sample.pixelIndex;
  if (Number.isInteger(sample.pixelId) && frame) {
    const { holoX, holoY } = holoXYFromPixelId(
      sample.pixelId,
      frame.frameWidth,
      frame.frameHeight,
      camera.resX,
      camera.resY,
    );
    return holoY * camera.resX + holoX;
  }
  return 0;
}

/**
 * Sequential add ≡ race-free atomicAdd on a serial CPU.
 * Does not claim GPU atomics ran.
 */
export function accumulateAtomic(field, samples, camera, frame) {
  rejectUnreadyPaths(samples);
  for (const sample of samples) {
    const idx = pixelIndexFromSample(sample, camera, frame);
    if (idx < 0 || idx >= field.length) continue;
    const { real, imag } = complexContrib(sample, camera.lambda);
    field[idx].real += real;
    field[idx].imag += imag;
  }
  return field;
}

export function nearestRgbChannel(wl) {
  const dR = Math.abs(wl - LAMBDA_R);
  const dG = Math.abs(wl - LAMBDA_G);
  const dB = Math.abs(wl - LAMBDA_B);
  if (dR <= dG && dR <= dB) return "R";
  if (dG <= dB) return "G";
  return "B";
}

/**
 * Three SSBOs. Broadband (no wl) hits all three with their own k.
 * path.wl overrides a single nearest channel.
 */
export function accumulateRGB(fields, samples, camera, frame) {
  rejectUnreadyPaths(samples);
  const lambdas = { R: LAMBDA_R, G: LAMBDA_G, B: LAMBDA_B };
  const dest = { R: fields.fieldR, G: fields.fieldG, B: fields.fieldB };
  for (const sample of samples) {
    const idx = pixelIndexFromSample(sample, camera, frame);
    const channels =
      sample.wl > 0 ? [nearestRgbChannel(sample.wl)] : ["R", "G", "B"];
    for (const ch of channels) {
      const { real, imag } = complexContrib(
        { ...sample, wl: sample.wl > 0 ? sample.wl : lambdas[ch] },
        lambdas[ch],
      );
      if (idx < 0 || idx >= dest[ch].length) continue;
      dest[ch][idx].real += real;
      dest[ch][idx].imag += imag;
    }
  }
  return fields;
}

/** Kernel 2 — constant-phase stub. Fresnel/FFT remains declared. */
export function propagateConstantPhase(field) {
  return {
    field,
    status: "declared",
    kernel: "constant-phase",
    note: "No Fresnel / Rayleigh–Sommerfeld / FFT. Identity only.",
  };
}

/** Kernel 3 — phase-only, after SSBO is stable. atan(imag, real) → [0,1] */
export function phaseNorm(real, imag) {
  const phase = Math.atan2(imag, real);
  return (phase + Math.PI) / (2 * Math.PI);
}

/** Models WGSL atomicLoad(f32). CPU cells may be numbers or { value } / .load(). */
export function atomicLoadF32(cell) {
  if (typeof cell === "number") return cell;
  if (cell && typeof cell.load === "function") return Number(cell.load());
  if (cell && typeof cell === "object" && "value" in cell) return Number(cell.value);
  return Number(cell ?? 0);
}

function loadComplex(p, mode) {
  if (mode === "atomic") {
    return { real: atomicLoadF32(p?.real), imag: atomicLoadF32(p?.imag) };
  }
  return { real: Number(p?.real ?? 0), imag: Number(p?.imag ?? 0) };
}

/**
 * Unified PhaseEncode.
 * @param {Array<{real:number,imag:number}>} field
 * @param {{ mode?: "tiled"|"atomic" }} [opts] tiled = plain f32 (Polar); atomic = atomicLoad (RX 7000+)
 */
export function encodePhaseOnly(field, opts = {}) {
  const mode = opts.mode === "atomic" ? "atomic" : "tiled";
  return field.map((p) => {
    const { real, imag } = loadComplex(p, mode);
    return phaseNorm(real, imag);
  });
}

export function encodePhaseRGB(fields) {
  return {
    r: encodePhaseOnly(fields.fieldR),
    g: encodePhaseOnly(fields.fieldG),
    b: encodePhaseOnly(fields.fieldB),
  };
}

/**
 * Debug encode map — not atan2 / not SLM phase-only.
 * tanh bounds (−∞, ∞) → (−1, 1); 0.5 + 0.5*tanh maps to (0, 1).
 * Zero → mid-gray 0.5. Negative → darker. Positive → brighter.
 */
export const DEBUG_REAL_IMAG_MAP = Object.freeze({
  formula: "0.5 + 0.5 * tanh(x)",
  channels: Object.freeze({
    r: "mapped real",
    g: "mapped imag",
    b: "mapped |E| (or 0 if blue='zero')",
  }),
  note: "Debug field visualization. Production PhaseEncode remains atan2(imag, real).",
});

export function mapBoundedField(x) {
  return 0.5 + 0.5 * Math.tanh(Number(x) || 0);
}

/**
 * Debug PhaseEncode: two-channel (or RGB pack) visualization of Re/Im.
 * Does not replace encodePhaseOnly.
 * @param {Array<{real:number,imag:number}>} field
 * @param {{ mode?: "tiled"|"atomic", blue?: "mag"|"zero" }} [opts]
 */
export function encodeDebugRealImag(field, opts = {}) {
  const mode = opts.mode === "atomic" ? "atomic" : "tiled";
  const blue = opts.blue === "zero" ? "zero" : "mag";
  return field.map((p) => {
    const { real, imag } = loadComplex(p, mode);
    const r = mapBoundedField(real);
    const g = mapBoundedField(imag);
    const b = blue === "zero" ? 0 : mapBoundedField(Math.hypot(real, imag));
    return { r, g, b, real, imag };
  });
}

export function fieldMagnitude(pixel) {
  return Math.hypot(pixel.real, pixel.imag);
}

export function createMonoField(resX, resY) {
  return createComplexField(resX, resY);
}
