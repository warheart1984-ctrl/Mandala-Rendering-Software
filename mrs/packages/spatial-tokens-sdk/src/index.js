/**
 * @mrs/spatial-tokens-sdk — re-exports math core + skeleton API client.
 *
 * Local tokenize: enforced (via renderer-core path).
 * HoloRT4DClient: skeleton.
 */

export {
  SPATIAL_TOKEN_SCHEME,
  SPATIAL_TOKEN_STATUS,
  createGridCell,
  createSpatialToken,
  clampByte,
  canonicalTokenJson,
  tokenizeFromDepthGrid,
  hashSpatialToken,
  faceRigFromLandmarkXYZ,
  FACE_OBJECT_STATUS,
  packFlow,
  MOTION_TOKEN_STATUS,
  grayscalePseudoDepth,
  IMAGE_PSEUDO_DEPTH_STATUS,
} from "../../renderer-core/src/render/rt4d/holort4d/spatial-tokens/index.js";

export { HoloRT4DClient } from "./client.js";
export { tokenize } from "./tokenize-local.js";
