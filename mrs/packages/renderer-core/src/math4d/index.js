/**
 * math4d — clean 4D math + camera + slice + BSDF + animation API surface.
 *
 * Prefer this package path over inventing parallel math. SoT remains:
 *   src/math/{vec4,so4,hyperplane,clip,project,mat4}.js
 *   src/camera/Camera4D.js
 *   src/render/slicer.js
 *   src/render/rt4d/material/{bsdf4d,ggx4d}.js
 */

export * from "../math/vec4.js";
export {
  IDENTITY4,
  rotationMatrix,
  mat4mul,
  mat4transpose,
  mat4apply,
  mat4det,
  validateSO4,
  buildSO4,
  slerpSO4,
} from "../math/so4.js";
export {
  createHyperplane,
  hyperplaneFromPointAndNormal,
  signedDistance,
  isInside,
  edgeIntersectT,
  edgeIntersect,
  intersectSegment,
  projectOntoHyperplane,
  hyperplaneBasis,
  classifyTriangle,
  animateHyperplane,
  rotationAligningNormal,
} from "../math/hyperplane.js";
export { clipTriangle, clipMesh, clipMeshWithEdges } from "../math/clip.js";
export {
  project4Dto3D,
  project3Dto2D,
  project4Dto2D,
  projectEdge4Dto2D,
} from "../math/project.js";
export { composeRotations, cinematicRotation } from "../math/mat4.js";

export * from "./rot4.js";
export * from "./quat4.js";
export * from "./projection.js";
export * from "./slice.js";
export * from "./track4.js";
export * from "./temporal-extrusion.js";
export * from "./pipeline.js";
export * from "./contract.js";
export * from "./rosetta.js";
export * from "./bsdf-context.js";

export { Camera4D, createFrameEvidence } from "../camera/Camera4D.js";
export { HyperplaneSlicer } from "../render/slicer.js";

/** Module status map (honest tags). */
export const MATH4D_STATUS = Object.freeze({
  vec4: "enforced",
  rot4: "enforced",
  mat4x4: "enforced",
  quat4: "partial",
  quatExpLog: "enforced",
  bivec: "partial",
  hyperplane: "enforced",
  clipTriangle: "enforced",
  projection: "enforced",
  camera4d: "enforced",
  sliceModes: "enforced",
  bsdf: "enforced",
  bsdfExtensions: "partial",
  track4: "partial",
  temporalExtrusion: "partial",
  debugVisualizer: "partial",
  pipelineDiagram: "enforced",
  pipelineWorld: "enforced",
  pipelineCamera: "enforced",
  pipelineSlice: "enforced",
  pipelineClip: "enforced",
  pipelineNdc: "enforced",
  pipelineScreen: "partial",
  mathFirstContract: "enforced",
  mathLayer: "enforced",
  numericLayer: "partial",
  physicalLayer: "declared",
  scriptR: "declared",
  holographicRecorder: "declared",
  rosetta: "partial",
});
