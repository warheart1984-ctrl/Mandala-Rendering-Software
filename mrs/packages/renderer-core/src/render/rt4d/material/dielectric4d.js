/**
 * Simple dielectric BSDF for glass tubes (Fresnel reflect / refract).
 *
 * Drive-G-1: This is a 3-space Snell approximation on the hit normal (xyz);
 * it is not a full 4D dielectric manifold. Transmission + mild emission on the
 * material (not isLight) gives neon-glass tubes at higher sample counts.
 * NEE shadow rays use {@link dielectricShadowTransmittance} so tubes do not
 * hard-occlude lights (enter+exit interfaces attenuate, opaque still blocks).
 */
import { vec4, dot, normalize, sub, scale, add, neg } from "../math/vec4.js";
import { BSDF4D } from "./bsdf4d.js";

/** Slight rim boost on Schlick (grazing only) — face-on stays near R0. */
export const DIELECTRIC_FRESNEL_RIM_BOOST = 1.22;

function reflect(v, n) {
  return sub(v, scale(n, 2 * dot(v, n)));
}

/** Snell's law in the wi–n plane; returns null on TIR. */
function refract(wi, n, eta) {
  const cosI = dot(neg(wi), n);
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return normalize(add(scale(wi, eta), scale(n, eta * cosI - Math.sqrt(k))));
}

/**
 * Schlick Fresnel with a mild grazing rim boost.
 * @param {number} cosTheta
 * @param {number} ior
 * @param {number} [rimBoost]
 */
export function fresnelDielectric(
  cosTheta,
  ior,
  rimBoost = DIELECTRIC_FRESNEL_RIM_BOOST,
) {
  const c = Math.max(0, Math.min(1, Math.abs(cosTheta)));
  const r0 = ((1 - ior) / (1 + ior)) ** 2;
  const schlick = r0 + (1 - r0) * (1 - c) ** 5;
  const grazing = (1 - c) ** 3;
  const boost = 1 + (Math.max(1, rimBoost) - 1) * grazing;
  return Math.min(1, schlick * boost);
}

/**
 * Thin-wall shadow transmittance for one glass body (enter+exit ≈ (1−F)²).
 * No albedo tint — cyan glass was crushing NEE through tubes.
 * @param {number} cosTheta abs(n·dir)
 * @param {number} ior
 */
export function dielectricInterfaceTransmittance(cosTheta, ior) {
  const F = fresnelDielectric(cosTheta, ior);
  const T = (1 - F) * (1 - F);
  return Math.max(0.35, Math.min(1, T));
}

export function isDielectricMaterial(mat) {
  if (!mat || mat.isLight) return false;
  if (mat.isTransmissive === true) return true;
  return mat.type === "dielectric" || mat.type === "glass";
}

function radiusHint(hit) {
  if (Number.isFinite(hit?.radius) && hit.radius > 0) return hit.radius;
  const prim = hit?.primitive;
  if (Number.isFinite(prim?.radius) && prim.radius > 0) return prim.radius;
  return 0.2;
}

/**
 * March a shadow segment: dielectrics attenuate (thin-wall) then jump past the
 * tube cross-section; lights end the march as clear; any other hit hard-occludes.
 * @returns {{ transmittance: number, reachedLight: boolean }}
 */
export function dielectricShadowTransmittance(
  scene,
  origin,
  direction,
  maxDist,
  options = {},
) {
  const maxHops = options.maxHops ?? 12;
  let transmittance = 1;
  let remaining = Math.max(0, maxDist);
  let pos = origin;

  for (let hop = 0; hop < maxHops && transmittance > 1e-4 && remaining > 1e-4; hop++) {
    const hit = scene.intersect({
      origin: pos,
      direction,
      tMin: 0.001,
      tMax: remaining + 1e-3,
    });
    if (!hit) {
      // No geometry before maxDist — treated as clear (analytic / miss).
      return { transmittance, reachedLight: true };
    }

    const mat = scene.getMaterial?.(hit.materialId) ?? null;
    if (mat?.isLight) {
      return { transmittance, reachedLight: true };
    }

    if (isDielectricMaterial(mat)) {
      const cos = Math.abs(dot(neg(direction), hit.normal));
      const ior = mat.bsdf?.ior ?? mat.params?.ior ?? 1.52;
      transmittance *= dielectricInterfaceTransmittance(cos, ior);
      // Jump past tube diameter so sphere-tracing does not re-hit the interior.
      const jump = Math.max(0.08, 2.2 * radiusHint(hit));
      remaining -= hit.t + jump;
      pos = vec4(
        hit.position.x + direction.x * jump,
        hit.position.y + direction.y * jump,
        hit.position.z + direction.z * jump,
        hit.position.w + direction.w * jump,
      );
      continue;
    }

    return { transmittance: 0, reachedLight: false };
  }

  return { transmittance: 0, reachedLight: false };
}

export class Dielectric4D extends BSDF4D {
  constructor(albedo, ior = 1.52, roughness = 0.03) {
    super();
    this.albedo = albedo ?? vec4(0.15, 0.45, 1.0, 1);
    this.ior = Number.isFinite(ior) && ior > 1 ? ior : 1.52;
    this.roughness = Math.max(0.01, roughness ?? 0.03);
  }

  evaluate(wi, wo, normal) {
    // Specular lobe approximation for MIS / NEE (delta-ish).
    const n = normalize(normal);
    const cosI = dot(wi, n);
    const facing = cosI >= 0 ? n : neg(n);
    const reflected = reflect(neg(wi), facing);
    const align = Math.max(0, dot(normalize(wo), reflected));
    const sharp = Math.pow(align, 1 / Math.max(0.02, this.roughness));
    const F = fresnelDielectric(Math.abs(cosI), this.ior);
    return scale(this.albedo, F * sharp * 0.25);
  }

  sample(wi, normal, u1, u2, u3) {
    const n = normalize(normal);
    const cosI = dot(wi, n);
    const entering = cosI > 0;
    const facing = entering ? n : neg(n);
    const eta = entering ? 1 / this.ior : this.ior;
    const F = fresnelDielectric(Math.abs(cosI), this.ior);

    if (u1 < F) {
      const wo = reflect(neg(wi), facing);
      if (dot(wo, facing) <= 0) return { wo, pdf: 0, value: vec4(0, 0, 0, 0) };
      return {
        wo: normalize(wo),
        pdf: F,
        value: scale(this.albedo, F),
      };
    }

    const wt = refract(wi, facing, eta);
    if (!wt) {
      const wo = reflect(neg(wi), facing);
      return { wo: normalize(wo), pdf: 1, value: this.albedo };
    }
    const T = 1 - F;
    return {
      wo: wt,
      pdf: Math.max(1e-4, T),
      value: scale(this.albedo, T),
    };
  }

  pdf(wi, wo, normal) {
    const n = normalize(normal);
    const cosI = dot(wi, n);
    const facing = cosI >= 0 ? n : neg(n);
    const F = fresnelDielectric(Math.abs(cosI), this.ior);
    const reflected = reflect(neg(wi), facing);
    const align = Math.max(0, dot(normalize(wo), reflected));
    if (align > 0.995) return F;
    return Math.max(1e-4, 1 - F);
  }
}
