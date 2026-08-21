/**
 * Lattice + governance Hamiltonians (Mandala substrate + AAIS).
 * Physics σ and governance σ are different fields.
 */

export {
  HAMILTONIAN_STATUS,
  HAMILTONIAN_OPERATOR,
  HAMILTONIAN_CLAIM,
  DEFAULT_LATTICE_PARAMS,
  cellCountOf,
  latticeIdx,
  createLattice,
  siteU,
  siteDU,
  couplingEnergy,
  hamiltonianEnergy,
  hamiltonianForceInto,
  relaxStep,
  meanSigma,
  meanAbsSigma,
  maxAbsForce,
  maxAbsDelta,
  twoPointCorrX,
  countSignDomains,
  describeLatticeHamiltonian,
} from "../../substrate/hamiltonian.mjs";

export {
  SIM_STATUS,
  SCAN_STATUS,
  initRandomLattice,
  initWellLattice,
  simulateLattice,
  scanCoupling,
} from "./simulate.mjs";

export {
  writeHamiltonianArtifacts,
  heatmapPng,
  seriesChartPng,
  DEFAULT_OUT as HAMILTONIAN_OUT,
} from "./visualize.mjs";

export {
  GOV_STATUS,
  GOV_OPERATOR,
  GOV_DIMS,
  GOV_N,
  GOV_HIGHER_DIMS_STATUS,
  DEFAULT_ALPHA,
  DEFAULT_W,
  DEFAULT_GOV_PARAMS,
  NIGHTLY_ETA,
  NIGHTLY_ALPHA,
  NIGHTLY_W,
  NIGHTLY_GOV_PARAMS,
  CPE_HGOV_CODE,
  siteUgov,
  siteDUgov,
  Wgov,
  uniqueGovEdges,
  hamiltonianGov,
  hamiltonianGovForceInto,
  finiteDiffGovForce,
  siteHgovLocal,
  rankGovFailures,
  relaxGovStep,
  relaxGovernance,
  nightlyGovernanceRelaxation,
  detectGovRegimeChange,
  toNightlyPythonPayload,
  evaluateCpeHgov,
  applyCarEvidence,
  inferGovEdges,
  createDemoGovernanceGraph,
  describeGovernanceHamiltonian,
  defaultSigma,
  cloneSigma,
} from "./governance.mjs";
