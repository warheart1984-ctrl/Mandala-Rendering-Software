/**
 * Mandala substrate — RHFD vacuum → Mandala pixels + Chamber motion.
 * Organ Map: Mandala + Simulation Chamber. Not a new organ.
 */
export {
  moebiusParity,
  moebiusTwistGradient,
  gradientField,
  twist,
  normalizeVec4,
  HEX_DIRS,
  hexCellsInRadius,
  hexLoopConsistent,
  hexLoopXor,
} from "./moebius.mjs";

export {
  createDualLattice,
  createHexLattice,
  createSquareLattice,
  fillGroundState,
  addDefect,
  flipEdgeParity,
  recomputeForces,
  allHexLoopsConsistent,
  inconsistentHexCount,
  meanForce,
  maxForceMagnitude,
  localForceNear,
  stepEuler,
  netDrift,
  etaMean,
} from "./dual-lattice.mjs";

export {
  BLOCK_AVERAGE,
  sppMean,
  boxDownsample,
  describeRenderPipeline,
} from "./block-average.mjs";

export {
  describeChamberSubstrate,
  attachDefectTick,
  surrogateForce,
  CHAMBER_GRAD_V_STATUS,
  MOTION_DRIVER_ACTUAL,
} from "./chamber-hook.mjs";
