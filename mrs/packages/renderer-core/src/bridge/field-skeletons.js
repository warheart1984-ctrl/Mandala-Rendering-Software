/**
 * Re-exports multi-field skeletons / partial helpers.
 * Prefer tensor-field.js / vector-field.js for typed APIs.
 */

export {
  createVectorField3D,
  stepVectorField3D,
  sampleVectorAtPosition,
  vectorFieldDivergenceAtPosition,
} from "./vector-field.js";

export {
  tensor3x3,
  tensorCurvature,
  createTensorField3D,
  setTensorAtCell,
  getTensorAtCell,
  sampleTensorAtPosition,
  sampleCurvatureAtPosition,
  tensorGradientAtPosition,
  stepTensorField3D,
} from "./tensor-field.js";

export { createWaveField4D, stepWaveField4D } from "./wave-field-4d.js";
