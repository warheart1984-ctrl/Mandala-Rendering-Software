import { selectQualityProfile } from "./QualitySelector.js";
import { selectConformanceProfile } from "./ConformanceSelector.js";

/**
 * @typedef {object} WavefrontConfigSelectorInput
 * @property {import("./QualitySelector.js").QualityId} quality
 * @property {"browser"|"unity"|"unreal"|"native"} host
 * @property {boolean} multiGpuAvailable
 */

/**
 * Canonical wavefront config entrypoint for hosts.
 * @param {WavefrontConfigSelectorInput} input
 * @returns {import("../gpu/wavefront/WavefrontConfig.js").WavefrontConfig}
 */
export function selectWavefrontConfig(input) {
  const quality = selectQualityProfile(input.quality);
  const conformance = selectConformanceProfile();

  return {
    maxDepth: quality.maxDepth,
    samplesPerPixel: quality.samplesPerPixel,
    tileSize: quality.tileSize,
    quality: quality.id,
    enableDenoiser: quality.enableDenoiser,
    // Record-optional: prefer recording when conformance asks; never force multi-GPU in Phase B
    enableCurvatureEvidence: conformance.recordCurvatureEvidence,
    enableMultiGpu: false,
  };
}
