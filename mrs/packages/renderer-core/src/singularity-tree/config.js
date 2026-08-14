/**
 * SingularityTreeConfig — declarative configuration for the Singularity Tree.
 *
 * The engine is configurable without code modification. All limits are
 * validated at normalize time; invalid limits throw (fail closed).
 *
 * Status: enforced (verified by failure tests).
 */

export const EXECUTION_MODES = Object.freeze({
  ANALYZE: "ANALYZE",
  GENERATE: "GENERATE",
  RENDER: "RENDER",
});

export const TOPOLOGY_TARGETS = Object.freeze(["S3"]);

export const DEFAULT_SINGULARITY_TREE_CONFIG = Object.freeze({
  // L0 — root
  rootDimension: 4,
  deterministicSeed: 0xc0ffee,

  // L1 — hierarchy
  maxDepth: 4,
  maxNodes: 1024,
  maxBranchFactor: 4,
  branchingExponent: 2.5,
  minBranchFactor: 2,
  scaleMin: 0.45,
  scaleMax: 0.8,

  // L2 — differentiation
  criticalThreshold: 0.12,
  differentiateOnlyAboveThreshold: true,

  // L3 — refinement
  refinementLevelBase: 1,
  maxExpansions: 4096,
  allowTopologyChange: false,

  // L2 — association
  siblingAssociationAngle: 75,

  // L4 — local geometry
  leafChartRadiusWorld: 1.0,
  leafSampleResolution: 4,
  chartCoverage: 1.0,

  // L5 — continuum
  topologyTarget: "S3",
  chartOverlapFraction: 0.35,
  weldDistance: 1e-3,
  transitionMapResolution: 2,

  // projection
  projectionD4: 4.0,
  projectionTheta: 0.35,
  projectionPhi: 0.6,
  projectionTau: 0.0,
  projectionKappa: 0.0,

  // provenance
  enableEvidence: true,
  evidenceTimestamp: false,

  // modes
  enableTopologyValidation: true,
  enableGeometryGeneration: true,
  enableProjection: true,
  enableDeterminismCheck: true,
  // adaptive refinement (observation-driven)
  enableAdaptiveRefinement: false,
  adaptiveMaxExtraDepth: 3,

  // fail-closed behavior
  failClosed: true,
  selfSimilarityClass: "yggdrasil-c1",
  createdBy: "singularity-tree",
  engineVersion: "1.0.0",
});

/**
 * Deep-merge user config over defaults and validate limits.
 * @param {object} [user] partial configuration
 * @returns {Readonly<object>} frozen, normalized configuration
 * @throws {TypeError} on invalid configuration values
 */
export function normalizeSingularityTreeConfig(user = {}) {
  if (user === null || typeof user !== "object") {
    throw new TypeError("SingularityTreeConfig must be an object");
  }
  const cfg = { ...DEFAULT_SINGULARITY_TREE_CONFIG, ...user };

  const mustBeNumber = (key, min, max) => {
    const v = cfg[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      throw new TypeError(
        `SingularityTreeConfig.${key} must be a finite number in [${min}, ${max}] (got ${v})`,
      );
    }
    return v;
  };

  mustBeNumber("rootDimension", 2, 6);
  mustBeNumber("maxDepth", 0, 32);
  mustBeNumber("maxNodes", 1, 1_000_000);
  mustBeNumber("maxBranchFactor", 1, 64);
  mustBeNumber("branchingExponent", 0.5, 8);
  mustBeNumber("minBranchFactor", 0, 64);
  mustBeNumber("criticalThreshold", 1e-9, 1e6);
  mustBeNumber("scaleMin", 0.01, 1);
  mustBeNumber("scaleMax", 0.01, 1);
  mustBeNumber("maxExpansions", 1, 100_000_000);
  mustBeNumber("leafSampleResolution", 1, 12);
  mustBeNumber("chartCoverage", 0.05, 10);

  if (cfg.minBranchFactor > cfg.maxBranchFactor) {
    throw new TypeError(
      "SingularityTreeConfig.minBranchFactor must be <= maxBranchFactor",
    );
  }
  if (cfg.scaleMin > cfg.scaleMax) {
    throw new TypeError("SingularityTreeConfig.scaleMin must be <= scaleMax");
  }
  if (!TOPOLOGY_TARGETS.includes(cfg.topologyTarget)) {
    throw new TypeError(
      `SingularityTreeConfig.topologyTarget must be one of ${TOPOLOGY_TARGETS.join(", ")}`,
    );
  }
  if (typeof cfg.deterministicSeed !== "number" || !Number.isFinite(cfg.deterministicSeed)) {
    throw new TypeError("SingularityTreeConfig.deterministicSeed must be a finite number");
  }
  if (typeof cfg.enableEvidence !== "boolean") {
    throw new TypeError("SingularityTreeConfig.enableEvidence must be a boolean");
  }
  for (const key of ["enableTopologyValidation", "enableGeometryGeneration", "enableProjection", "failClosed", "evidenceTimestamp"]) {
    if (typeof cfg[key] !== "boolean") {
      throw new TypeError(`SingularityTreeConfig.${key} must be a boolean`);
    }
  }
  for (const key of ["selfSimilarityClass", "createdBy", "engineVersion"]) {
    if (typeof cfg[key] !== "string" || cfg[key].length === 0) {
      throw new TypeError(`SingularityTreeConfig.${key} must be a non-empty string`);
    }
  }

  return Object.freeze(cfg);
}

export const SINGULARITY_TREE_CONFIG_BANNER = "singularity-tree.config.v1";