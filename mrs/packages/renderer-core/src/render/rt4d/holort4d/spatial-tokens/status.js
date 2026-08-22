/**
 * Honest status tags for HoloRT4D Spatial Tokens (AGENTS.md R4).
 *
 * Truth model: tokenize from chamber/rig depth+curvature+normals+grid = math.
 * Arbitrary photo → metric depth without ML = declared (not claimed here).
 */

export const SPATIAL_TOKEN_SCHEME = "HoloRT4D-Spatial-V1";

export const SPATIAL_TOKEN_STATUS = Object.freeze({
  scheme: SPATIAL_TOKEN_SCHEME,
  tokenizeFromDepthGrid: "enforced",
  curvatureFromGradients: "enforced",
  normalsFromGradients: "enforced",
  gridPartition16: "enforced",
  hashCanonicalJson: "enforced",
  faceObjectLabels: "partial",
  motionFromPrevDepth: "partial",
  imageBase64ToDepth: "declared",
  apiServerStub: "partial",
  billingUsdPerCall: "declared",
  marketingSite: "skeleton",
  sdkClient: "skeleton",
  note:
    "Deterministic tokenize requires Float32 depth (chamber/opticalLength/landmark-z). Photo→depth ML path is declared, not implemented.",
});
