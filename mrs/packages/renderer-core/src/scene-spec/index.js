/**
 * @mrs/renderer-core/scene-spec
 *
 * LLM-directed SceneSpecification: parse → validate → convert → timeline.
 * See docs/4d-engine/v2/scene-spec/SCENE_SPEC_RFC.md
 */

export {
  parseSceneSpecification,
  parseSceneSpecificationJson,
} from "./parse.js";

export {
  validateSceneCapabilities,
  SUPPORTED_OBSERVATION_MODES,
  RT4D_SURFACE_IDS,
  normalizeSurfaceId,
  MAX_WIDTH,
  MAX_HEIGHT,
  MAX_SAMPLES,
  MAX_DEPTH,
  MAX_ANIMATION_FRAMES,
} from "./validate.js";

export {
  convertSceneSpecification,
  hashSceneSpecification,
  canonicalJson,
  hashIdToSeed,
  expandSurfaceToSpheres,
  rotatePoint4d,
} from "./convert.js";

export {
  buildTesseractLatticeSpheres,
  buildLatticeGridSpheres,
  tesseractEdges,
  tesseractProjectedVerts,
} from "./tesseractLatticeSpheres.js";

export {
  sampleTimeline,
  sampleFrame,
  applyKeyframeBlend,
  convertSampledFrame,
} from "./timeline.js";
