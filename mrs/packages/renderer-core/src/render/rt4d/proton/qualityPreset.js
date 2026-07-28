/**
 * Proton HQ quality preset resolver.
 *
 * STATUS: **enforced** — table + resolve; wired into CLI / pipeline.
 * No GPU. Enrich maxRadius stays antifog (~0.65–0.72), not splat support.
 *
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 *
 * @typedef {"default"|"high"} QualityPresetId
 *
 * @typedef {object} QualityPresetResolved
 * @property {QualityPresetId} id
 * @property {number} width
 * @property {number} height
 * @property {number} supersample
 * @property {"none"|"reinhard"|"aces-lite"} tonemap
 * @property {number} exposure
 * @property {number} gamma
 * @property {number} densityBoost
 * @property {number} radiusScale
 * @property {number} colorGain
 * @property {number} maxRadius
 * @property {number} sigmaScale
 * @property {number} opacityScale
 * @property {boolean} lightingPunch
 * @property {boolean} bloom
 * @property {boolean} depthCue
 */

/** @type {Readonly<Record<QualityPresetId, Omit<QualityPresetResolved, "id">>>} */
export const QUALITY_PRESET_TABLE = Object.freeze({
  default: Object.freeze({
    width: 256,
    height: 256,
    supersample: 1,
    tonemap: "none",
    exposure: 1,
    gamma: 2.2,
    // Match enrichJudgeWowField antifog defaults (not splat support radii)
    densityBoost: 1,
    radiusScale: 1.55,
    colorGain: 1.35,
    maxRadius: 0.72,
    sigmaScale: 1,
    opacityScale: 1,
    lightingPunch: false,
    bloom: false,
    depthCue: false,
  }),
  high: Object.freeze({
    width: 512,
    height: 512,
    supersample: 2,
    tonemap: "aces-lite",
    exposure: 1.35,
    gamma: 2.2,
    densityBoost: 1.4,
    radiusScale: 1.65,
    colorGain: 1.5,
    maxRadius: 0.68,
    sigmaScale: 1.1,
    opacityScale: 1.15,
    lightingPunch: true,
    bloom: false,
    depthCue: false,
  }),
});

/**
 * Resolve a quality preset id with optional shallow overrides.
 *
 * STATUS: **enforced**
 *
 * @param {QualityPresetId|string} id
 * @param {Partial<QualityPresetResolved>} [overrides]
 * @returns {QualityPresetResolved}
 */
export function resolveQualityPreset(id, overrides = {}) {
  const key = String(id ?? "default");
  if (!(key in QUALITY_PRESET_TABLE)) {
    throw new Error(
      `resolveQualityPreset: unknown QualityPresetId "${key}" (expected default|high)`,
    );
  }
  /** @type {QualityPresetId} */
  const presetId = /** @type {QualityPresetId} */ (key);
  const base = QUALITY_PRESET_TABLE[presetId];
  return {
    ...base,
    ...overrides,
    id: presetId,
  };
}
