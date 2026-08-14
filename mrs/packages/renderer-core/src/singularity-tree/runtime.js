/**
 * runtime.js — the primary runtime pipeline (§21).
 *
 *   initializeRoot → createHierarchy → evaluateDifferentiation →
 *   applyExpansion → applyAssociation → applyRefinement → createChildren →
 *   validateTopology → [recursive] → generateLeafGeometry →
 *   assembleContinuum → validateGlobalTopology → projectTo3D → render
 *
 * The renderer is the final consumer; it never participates in generative
 * decisions (INV-10).
 *
 * Execution modes:
 *   ANALYZE   — hierarchy + math state only (no rendering, no manifold)
 *   GENERATE  — hierarchy + geometry + manifold
 *   RENDER    — generate/load manifold and produce a visualization
 *
 * Status: enforced (verified by runtime tests).
 */

import { createRoot, assertRootImmutable } from "./root/SingularityRoot.js";
import { generateHierarchy, refine } from "./refinement/RefinementEngine.js";
import { generateAllLeafGeometry, generateLeafGeometry } from "./geometry/GeometryFactory.js";
import { assembleContinuum } from "./continuum/ContinuumAssembler.js";
import { validateRefinement, validateGlobalTopology } from "./topology/TopologyValidator.js";
import { validateInvariants } from "./validation/InvariantEngine.js";
import { validateArchitecture } from "./validation/ArchitectureValidator.js";
import { ProvenanceLedger } from "./evidence/ProvenanceLedger.js";
import { projectManifoldToScreen, projectManifoldTo3D, project4DTo3D } from "./projection/Project4DTo3D.js";
import { hashState } from "./determinism/StateHasher.js";
import { normalizeSingularityTreeConfig, EXECUTION_MODES } from "./config.js";
import { createObservation, requiredLevelForNode } from "./refinement/AdaptiveRefinementPolicy.js";
import { computeRefinementFeedback, applyRefinementFeedback } from "./refinement/RefinementFeedback.js";

export function initializeRoot(config = {}) {
  const root = createRoot(config);
  assertRootImmutable(root);
  return root;
}

export function createHierarchy(root, { ledger = null, observation = null, policyOverride = null } = {}) {
  return generateHierarchy(root, { ledger, observation, policyOverride });
}

/**
 * World-compiler entry point: generate the world graph for an observation.
 * The camera picks the visible region, the region picks the required
 * geometric resolution, and Yggdrasil refinement answers with per-branch
 * levels — far branches shallow, near/focal branches deep.
 */
export function generateWorldForObservation(config = {}, observation, options = {}) {
  const normalized = normalizeSingularityTreeConfig({ ...config, enableAdaptiveRefinement: true });
  const root = createRoot(normalized);
  const ledger = options.ledger ?? null;
  const { hierarchy, summary } = generateHierarchy(root, { ledger, observation });
  const manifold = normalized.enableGeometryGeneration
    ? (generateAllLeafGeometry(hierarchy, normalized), assembleContinuum(hierarchy, normalized))
    : null;
  return { root, hierarchy, summary, manifold, observation, config: normalized };
}

/**
 * Feedback loop (world compiler ↔ observer):
 *   1. generate adaptively for the observation;
 *   2. measure per-leaf resolution error (observation constraint);
 *   3. regenerate with required-level overrides where resolution is missing.
 * Replayable: same (config, seed, observation) ⇒ identical hierarchy.
 */
export function refineWorldWithFeedback(config = {}, observation) {
  const normalized = normalizeSingularityTreeConfig({ ...config, enableAdaptiveRefinement: true });
  const world = generateWorldForObservation(normalized, observation, {});
  const feedback = computeRefinementFeedback(world.hierarchy, observation, normalized);
  if (feedback.length === 0) {
    return { ...world, feedback };
  }
  const refined = applyRefinementFeedback(normalized, feedback, {});
  return { ...refined, feedback, baseHierarchy: world.hierarchy };
}

export function runSingularityTree(config = {}, options = {}) {
  const { mode = EXECUTION_MODES.ANALYZE, renderer = null } = options;
  const normalized = normalizeSingularityTreeConfig(config);

  const root = initializeRoot(normalized);
  const ledger = new ProvenanceLedger(normalized);
  const { hierarchy, summary } = createHierarchy(root, { ledger });

  let leafGeometries = null;
  let manifold = null;
  let projected = null;
  let renderResult = null;

  if (mode === EXECUTION_MODES.GENERATE || mode === EXECUTION_MODES.RENDER) {
    if (normalized.enableGeometryGeneration) {
      leafGeometries = generateAllLeafGeometry(hierarchy, normalized);
    }
    manifold = assembleContinuum(hierarchy, normalized);
  }

  if (mode === EXECUTION_MODES.RENDER) {
    projected = projectManifoldToScreen(manifold, {
      d4: normalized.projectionD4,
      width: options.width || 640,
      height: options.height || 640,
      scale: options.scale || 220,
    });
    if (typeof renderer === "function") {
      renderResult = renderer({ root, hierarchy, manifold, projected, config: normalized });
    }
  }

  const invariants = validateInvariants({
    root,
    hierarchy,
    config: normalized,
    ledger,
    determinismReport:
      normalized.enableDeterminismCheck ? generateDeterminismReport(normalized) : null,
    summary,
    runtime: { renderingParticipatedInGeneration: false },
  });

  const architecture = validateArchitecture(hierarchy, normalized);

  return {
    mode,
    root,
    ledger,
    hierarchy,
    summary,
    config: normalized,
    leafGeometries,
    manifold,
    projected,
    renderResult,
    invariants,
    architecture,
  };
}

/** Determinism report: same config+seed ⇒ identical hierarchy state hashes. */
export function generateDeterminismReport(config = {}, runs = 2) {
  const normalized = normalizeSingularityTreeConfig(config);
  const outputs = [];
  for (let i = 0; i < runs; i++) {
    const root = createRoot(normalized);
    const { hierarchy } = generateHierarchy(root, { ledger: null });
    outputs.push(
      hashState({
        ids: hierarchy.allNodes().map((n) => n.id).sort(),
        topology: hierarchy.allNodes().map((n) => n.topologySignature.combinatorial).sort(),
        state: hierarchy.allNodes().map((n) => n.state.stateHash).sort(),
        geometry: hierarchy.allNodes().map((n) => n.geometrySignature || null).sort(),
      }),
    );
  }
  const identical = outputs.every((h) => h === outputs[0]);
  return {
    identical,
    stateHashesEqual: identical,
    runs,
    outputHashes: outputs,
    rootId: "root",
    scheme: "singularity-tree.determinism-report.v1",
  };
}

export function validateTopologyHierarchy(hierarchy, config) {
  let ok = true;
  const violations = [];
  for (const node of hierarchy.allNodes()) {
    const children = hierarchy.childrenOf(node.id);
    if (children.length === 0) continue;
    const res = validateRefinement(node, children, config);
    if (!res.ok) {
      ok = false;
      violations.push(...res.violations);
    }
  }
  return { ok, violations };
}

export {
  createRoot,
  generateHierarchy,
  refine,
  generateLeafGeometry,
  generateAllLeafGeometry,
  assembleContinuum,
  validateGlobalTopology,
  validateInvariants,
  validateArchitecture,
  projectManifoldToScreen,
  projectManifoldTo3D,
  project4DTo3D,
  ProvenanceLedger,
  EXECUTION_MODES,
  createObservation,
  requiredLevelForNode,
  computeRefinementFeedback,
  applyRefinementFeedback,
};