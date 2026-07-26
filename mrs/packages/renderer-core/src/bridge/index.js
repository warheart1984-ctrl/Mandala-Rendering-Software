/**
 * Wave field bridge (3D ↔ 4D) — BridgeContract v1 / v2 / v3.
 *
 * Status overview: see README.md and BRIDGECONTRACT_v*.md.
 * Not wired into PathTracer4D / Genblaze live loops.
 */

export {
  idx,
  createWaveField3D,
  stepWaveField3D,
} from "./wave-field-3d.js";

export {
  bridgeMap3Dto4D,
  sampleWaveAtPosition,
  waveGradientAtPosition,
} from "./bridge-map.js";

export { applyWaveForceToBody } from "./wave-force.js";

export { WaveBridge, runBridgeFrame } from "./bridge-contract.js";

export { FieldRegistry } from "./field-registry.js";

export {
  WaveBridgeV2,
  runBridgeFrameV2,
  resolveCouplingArray,
} from "./bridge-contract-v2.js";

export {
  WaveBridgeV3,
  runBridgeFrameV3,
} from "./bridge-contract-v3.js";

export {
  transitionSignal,
  shouldDimensionalShift,
  shiftMap3to4,
  returnMap4to3,
} from "./transitions.js";

export {
  createVectorField3D,
  stepVectorField3D,
  sampleVectorAtPosition,
  vectorFieldDivergenceAtPosition,
  tensor3x3,
  tensorCurvature,
  createTensorField3D,
  setTensorAtCell,
  getTensorAtCell,
  sampleTensorAtPosition,
  sampleCurvatureAtPosition,
  tensorGradientAtPosition,
  stepTensorField3D,
  createWaveField4D,
  stepWaveField4D,
} from "./field-skeletons.js";
