/**
 * HoloRT4D Spatial Tokens — math core.
 *
 * Prefer chamber / opticalLength / landmark-z depth grids.
 * Photo→metric depth without ML is declared (not implemented here).
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
