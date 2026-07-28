/**
 * RT4D proton CECP Ω∞ barrel — six mods + legacy helpers.
 *
 * STATUS: **enforced** (six CPU mods + PNG)
 * Declared roadmap: MaterialMap4D, SpatialLayout4D, ForceField4D,
 * ProtonDynamics, SemanticTagging, ToneMap, Scene→Camera4D, anisotropic Σ, GPU.
 * HQ quality / tonemap / supersample: **enforced** (trail proton-hq-2026-07).
 * Bloom: **declared** stub.
 */

export {
  PROTON_MODULE_STATUS,
  CIR_OVERLAY_FIELDS,
  MAX_PROTONS,
  resolveMu,
} from "./types.js";
export { ProtonRegistry } from "./registry.js";
export { fromHyperspheres } from "./fromHyperspheres.js";
export { fromWorldDocumentRt4d } from "./fromWorldDocumentRt4d.js";
export { fromSceneSpec } from "./fromSceneSpec.js";
export { projectFootprint } from "./projectFootprint.js";
export { softSplatAccumulate } from "./softSplat.js";

export {
  sceneToProtonField,
  assertProtonFieldInvariants,
  makeProton,
  protonToLegacy,
} from "./sceneToProtonField.js";
export { applyLighting4D } from "./lighting4d.js";
export {
  projectProtonField,
  defaultCamera4D,
} from "./projectProtonField.js";
export { rasterizeProtons } from "./rasterizeProtons.js";
export { depthFromRaster, assertDepthFieldInvariants } from "./depthField.js";
export {
  normalsFromRaster,
  assertNormalFieldInvariants,
} from "./normalField.js";
export { rasterToImage, encodePngRgba } from "./rasterToImage.js";
export {
  runProtonPipeline,
  runProtonPipelineFromField,
  protonFieldFromLegacyProtons,
  protonFieldFromWorldDocumentRt4d,
  enrichJudgeWowField,
  demoSceneSpec,
} from "./pipeline.js";
export {
  encodeDepthPng,
  encodeNormalPng,
  writeTriptychAovs,
} from "./aovEncode.js";

/** HQ quality / post — STATUS enforced (bloom declared) */
export {
  resolveQualityPreset,
  QUALITY_PRESET_TABLE,
} from "./qualityPreset.js";
export { applyTonemap } from "./tonemap.js";
export { renderDims, downsampleBox } from "./supersample.js";
export { applyBloom } from "./bloom.js";
