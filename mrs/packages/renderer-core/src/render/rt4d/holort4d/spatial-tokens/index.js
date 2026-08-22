/**
 * HoloRT4D Spatial Tokens — math core.
 *
 * Prefer chamber / opticalLength / landmark-z depth grids.
 * Photo→metric depth without ML is declared (not implemented here).
 * ChatGPT primary payload: Holo-Scheme V1 (buildHoloSchemeV1).
 */

export { SPATIAL_TOKEN_SCHEME, SPATIAL_TOKEN_STATUS } from "./status.js";
export {
  createGridCell,
  createSpatialToken,
  clampByte,
  canonicalTokenJson,
} from "./types.js";
export { tokenizeFromDepthGrid } from "./tokenize.js";
export { hashSpatialToken } from "./hash.js";
export {
  faceRigFromLandmarkXYZ,
  FACE_OBJECT_STATUS,
} from "./face.js";
export { packFlow, MOTION_TOKEN_STATUS } from "./motion.js";
export {
  grayscalePseudoDepth,
  IMAGE_PSEUDO_DEPTH_STATUS,
} from "./image-pseudo-depth.js";
export {
  buildHoloSchemeV1,
  hashHoloScheme,
  canonicalHoloSchemeJson,
  formatHoloSchemeForLLM,
  HOLO_SCHEME_AUTH,
  HOLO_SCHEME_UNIT_COST,
  HOLO_SCHEME_EXECUTION_INSTRUCTION,
  HOLO_SCHEME_STATUS,
} from "./holo-scheme.js";
export { formatForLLM } from "./format-llm.js";
