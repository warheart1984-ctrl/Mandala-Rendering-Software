/**
 * Quality profiles for wavefront (mirrors declared RT4D v2 contract).
 * @typedef {"baseline"|"high"|"ultra"} QualityId
 *
 * @typedef {object} QualityProfile
 * @property {QualityId} id
 * @property {number} samplesPerPixel
 * @property {number} maxDepth
 * @property {number} tileSize
 * @property {boolean} enableDenoiser
 */

/** @param {QualityId} id */
export function selectQualityProfile(id) {
  switch (id) {
    case "baseline":
      return {
        id,
        samplesPerPixel: 1,
        maxDepth: 4,
        tileSize: 32,
        enableDenoiser: false,
      };
    case "high":
      return {
        id,
        samplesPerPixel: 4,
        maxDepth: 6,
        tileSize: 16,
        enableDenoiser: true,
      };
    case "ultra":
      return {
        id,
        samplesPerPixel: 8,
        maxDepth: 8,
        tileSize: 8,
        enableDenoiser: true,
      };
    default:
      throw new Error(`Unknown quality profile: ${id}`);
  }
}
