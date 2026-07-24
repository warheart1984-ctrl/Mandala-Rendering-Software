/**
 * @typedef {"baseline"|"high"|"ultra"} WavefrontQualityProfile
 *
 * @typedef {object} WavefrontConfig
 * @property {number} maxDepth
 * @property {number} samplesPerPixel
 * @property {number} tileSize
 * @property {WavefrontQualityProfile} quality
 * @property {boolean} enableDenoiser
 * @property {boolean} enableCurvatureEvidence
 * @property {boolean} enableMultiGpu
 */

/** @type {Record<WavefrontQualityProfile, Omit<WavefrontConfig, "enableCurvatureEvidence"|"enableMultiGpu">>} */
export const WAVEFRONT_QUALITY_DEFAULTS = Object.freeze({
  baseline: {
    maxDepth: 4,
    samplesPerPixel: 1,
    tileSize: 32,
    quality: "baseline",
    enableDenoiser: false,
  },
  high: {
    maxDepth: 6,
    samplesPerPixel: 4,
    tileSize: 16,
    quality: "high",
    enableDenoiser: true,
  },
  ultra: {
    maxDepth: 8,
    samplesPerPixel: 8,
    tileSize: 8,
    quality: "ultra",
    enableDenoiser: true,
  },
});
