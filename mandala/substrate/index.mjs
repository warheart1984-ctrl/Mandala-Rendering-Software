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
  hashNoise,
  hashNoise4,
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
  HAMILTONIAN_STATUS,
  HAMILTONIAN_OPERATOR,
  hamiltonianEnergy,
  hamiltonianForceInto,
  relaxStep,
  describeLatticeHamiltonian,
} from "./hamiltonian.mjs";

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
