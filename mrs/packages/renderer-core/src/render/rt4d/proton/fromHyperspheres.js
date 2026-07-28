/**
 * Map RT4D Hypersphere / capsule-like primitives → Proton4D[].
 *
 * STATUS: **enforced** (isotropic MVP)
 * Capsule: optional deterministic N=3 samples along axis a→b.
 */

import { MAX_PROTONS, resolveMu } from "./types.js";

/**
 * @param {unknown} color
 * @returns {[number, number, number]|undefined}
 */
function normalizeColor(color) {
  if (typeof color === "number" && Number.isFinite(color)) {
    const c = Math.min(1, Math.max(0, color));
    return [c, c, c];
  }
  if (Array.isArray(color) && color.length >= 3) {
    return [
      Math.min(1, Math.max(0, Number(color[0]) || 0)),
      Math.min(1, Math.max(0, Number(color[1]) || 0)),
      Math.min(1, Math.max(0, Number(color[2]) || 0)),
    ];
  }
  return undefined;
}

/**
 * @param {Record<string, unknown>} hs
 * @param {number} index
 * @param {Record<string, unknown>} opts
 * @returns {import("./types.js").Proton4D|null}
 */
function hypersphereToProton(hs, index, opts) {
  if (!hs || typeof hs !== "object") return null;
  // Anisotropic-only without radius: reject
  if (
    (hs.Sigma != null || hs.covariance != null) &&
    !(typeof hs.radius === "number" && hs.radius > 0)
  ) {
    return null;
  }
  const mu = resolveMu(hs);
  if (!mu) return null;
  const radius =
    typeof hs.radius === "number" && hs.radius > 0 ? hs.radius : 0.5;
  const opacity =
    typeof hs.opacity === "number"
      ? hs.opacity
      : typeof hs.weight === "number"
        ? hs.weight
        : 1;
  const color = normalizeColor(hs.color ?? hs.albedo);
  const id =
    typeof hs.id === "string" && hs.id.length > 0
      ? hs.id
      : `proton-${index}`;
  /** @type {import("./types.js").Proton4D} */
  const proton = {
    id,
    mu,
    radius,
    opacity,
    meta: {
      ...(hs.meta && typeof hs.meta === "object" ? hs.meta : {}),
      ...(opts.intentId ? { intentId: opts.intentId } : {}),
      ...(hs.Sigma != null || hs.covariance != null
        ? { anisotropicIgnored: true }
        : {}),
    },
  };
  if (color) proton.color = color;
  return proton;
}

/**
 * Deterministic N=3 samples along capsule axis a→b (t = 0, 0.5, 1).
 * @param {Record<string, unknown>} cap
 * @param {number} baseIndex
 * @param {Record<string, unknown>} opts
 * @returns {import("./types.js").Proton4D[]}
 */
function capsuleToProtons(cap, baseIndex, opts) {
  const a = Array.isArray(cap.a) ? cap.a : null;
  const b = Array.isArray(cap.b) ? cap.b : null;
  if (!a || !b || a.length < 3 || b.length < 3) return [];
  const radius =
    typeof cap.radius === "number" && cap.radius > 0 ? cap.radius : 0.25;
  const color = normalizeColor(cap.color ?? cap.albedo);
  const opacity =
    typeof cap.opacity === "number"
      ? cap.opacity
      : typeof cap.weight === "number"
        ? cap.weight
        : 1;
  const baseId =
    typeof cap.id === "string" && cap.id.length > 0
      ? cap.id
      : `capsule-${baseIndex}`;
  const ts = [0, 0.5, 1];
  /** @type {import("./types.js").Proton4D[]} */
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const mu = [
      Number(a[0]) + (Number(b[0]) - Number(a[0])) * t,
      Number(a[1]) + (Number(b[1]) - Number(a[1])) * t,
      Number(a[2]) + (Number(b[2]) - Number(a[2])) * t,
      (Number(a[3]) || 0) + ((Number(b[3]) || 0) - (Number(a[3]) || 0)) * t,
    ];
    /** @type {import("./types.js").Proton4D} */
    const proton = {
      id: `${baseId}-s${i}`,
      mu,
      radius,
      opacity,
      meta: {
        source: "oriented-capsule",
        sampleIndex: i,
        ...(opts.intentId ? { intentId: opts.intentId } : {}),
      },
    };
    if (color) proton.color = color;
    out.push(proton);
  }
  return out;
}

/**
 * @param {unknown} hyperspheres
 * @param {Record<string, unknown>} [opts]
 * @returns {import("./types.js").Proton4D[]}
 */
export function fromHyperspheres(hyperspheres, opts = {}) {
  const list = Array.isArray(hyperspheres)
    ? hyperspheres
    : hyperspheres && typeof hyperspheres === "object"
      ? [hyperspheres]
      : [];
  const max =
    typeof opts.maxProtons === "number" && opts.maxProtons > 0
      ? Math.floor(opts.maxProtons)
      : MAX_PROTONS;
  const sampleCapsules = opts.sampleCapsules !== false;
  /** @type {import("./types.js").Proton4D[]} */
  const out = [];
  let index = 0;
  for (const item of list) {
    if (out.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const kind = /** @type {Record<string, unknown>} */ (item).kind;
    if (kind === "oriented-capsule") {
      if (!sampleCapsules) continue;
      const samples = capsuleToProtons(
        /** @type {Record<string, unknown>} */ (item),
        index,
        opts,
      );
      for (const p of samples) {
        if (out.length >= max) break;
        out.push(p);
      }
      index += 1;
      continue;
    }
    const proton = hypersphereToProton(
      /** @type {Record<string, unknown>} */ (item),
      index,
      opts,
    );
    index += 1;
    if (proton) out.push(proton);
  }
  return out;
}
