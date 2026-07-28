/**
 * RT4D proton raster types (JSDoc).
 *
 * STATUS: **enforced** (isotropic MVP shapes + CIR overlay fields)
 *
 * CIR is a thin overlay on IntentRecord fields only
 * (id, actor, timestamp, purpose ← goal/type). No parallel governance layer.
 *
 * Soft splat is a NEW sibling path — not Engine3D triangle soft-raster.
 *
 * Canonical position field: `mu: [x,y,z,w]`. Alias `center` is accepted by mappers.
 * Anisotropic Σ∈R⁴ˣ⁴ remains **declared** (out of MVP).
 */

/**
 * Constitutional Intent Record overlay (thin; no parallel CKL).
 *
 * @typedef {object} CirOverlay
 * @property {string} id IntentRecord.id
 * @property {string} [actor] IntentRecord.actor
 * @property {string|number} [timestamp] IntentRecord.timestamp
 * @property {string} [purpose] Mapped from IntentRecord.goal / IntentRecord.type
 */

/**
 * Isotropic 4D proton (point + support radius) for CPU soft splat.
 *
 * @typedef {object} Proton4D
 * @property {string} [id]
 * @property {[number, number, number, number]} mu World-space position (canonical)
 * @property {[number, number, number, number]} [center] Alias for mu (accepted by mappers)
 * @property {number} radius Support radius (isotropic MVP); σ_world = radius/2
 * @property {[number, number, number]|number} [color] RGB 0–1 or scalar luminance
 * @property {number} [opacity] Premultiplied accumulate opacity (default 1)
 * @property {number} [weight] Alias for opacity
 * @property {unknown} [Sigma] Anisotropic covariance — **declared**; ignored/rejected in MVP
 * @property {Record<string, unknown>} [meta]
 */

/**
 * Evidence attached to a proton raster frame (provenance-ready).
 *
 * @typedef {object} ProtonRasterEvidence
 * @property {string} intentId
 * @property {string} [worldId]
 * @property {string} [timelineId]
 * @property {number} [timeSeconds]
 * @property {number} protonCount
 * @property {{ type: string, supportSigma: number }} kernel
 * @property {number} width
 * @property {number} height
 * @property {string} frameSha256
 * @property {string} [protonsHash]
 * @property {CirOverlay} [cir]
 * @property {Record<string, unknown>} [parameters]
 * @property {string} [status]
 */

/**
 * Projected 2D footprint of a proton (pre-splat).
 *
 * @typedef {object} ProtonFootprint2D
 * @property {string} [id]
 * @property {number} x
 * @property {number} y
 * @property {number} sigma Screen-space isotropic sigma (px)
 * @property {[number, number, number]|number} [color]
 * @property {number} [opacity]
 * @property {number} [weight]
 */

/** Default capacity (aligned with RT4D primitive cap). */
export const MAX_PROTONS = 128;

export const PROTON_MODULE_STATUS = "enforced";

export const CIR_OVERLAY_FIELDS = Object.freeze([
  "id",
  "actor",
  "timestamp",
  "purpose",
]);

/**
 * Normalize mu/center to a 4-tuple. Prefer `mu`, accept `center` alias.
 * @param {{ mu?: unknown, center?: unknown }} src
 * @returns {[number, number, number, number]|null}
 */
export function resolveMu(src) {
  const raw = src?.mu ?? src?.center;
  if (!Array.isArray(raw) || raw.length < 3) return null;
  return [
    Number(raw[0]) || 0,
    Number(raw[1]) || 0,
    Number(raw[2]) || 0,
    Number(raw[3]) || 0,
  ];
}
