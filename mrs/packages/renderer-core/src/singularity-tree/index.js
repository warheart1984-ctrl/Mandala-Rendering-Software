/**
 * Singularity Tree of Yggdrasil — hierarchical generative geometry
 * architecture for the Mandala 4D rendering system.
 *
 * ONE ROOT → MANY STATES → MANY RELATIONSHIPS → MANY LOCAL GEOMETRIES →
 * ONE EMERGENT CONTINUUM (Σ ≅ S³), projected 4D → 3D for rendering.
 *
 * The root defines the generative law; differentiation creates the hierarchy;
 * refinement creates geometry; the collection of local geometries produces
 * the continuum; topology remains an invariant across the process.
 *
 * Status: enforced (verified by the singularity-tree test suite).
 */

export {
  DEFAULT_SINGULARITY_TREE_CONFIG,
  normalizeSingularityTreeConfig,
  EXECUTION_MODES,
  TOPOLOGY_TARGETS,
  SINGULARITY_TREE_CONFIG_BANNER,
} from "./config.js";

export { createRoot, assertRootImmutable } from "./root/SingularityRoot.js";
export { createRootState, freezeRootState } from "./root/RootState.js";

export { createNode, nodeIsRoot } from "./hierarchy/HierarchyNode.js";
export { Hierarchy } from "./hierarchy/Hierarchy.js";
export { getLineage, lineageFromBranchPath, lineagePathFromBranchPath } from "./hierarchy/Lineage.js";

export { createDifferentiationState } from "./differentiation/DifferentiationState.js";
export { evaluateDifferentiation, canDifferentiate } from "./differentiation/ThresholdEvaluator.js";
export {
  differentiateState,
  rotateInPlane,
  computeDifferentiationState,
} from "./differentiation/DifferentiationEngine.js";

export { branch, sampleBranchFactor, BRANCHING_OPERATOR_ID } from "./branching/BranchingOperator.js";
export { expand, EXPANSION_OPERATOR_ID } from "./branching/ExpansionOperator.js";
export { associate, angularSeparation, ASSOCIATION_OPERATOR_ID } from "./branching/AssociationOperator.js";
export { refine as refineDescriptors, REFINEMENT_OPERATOR_ID } from "./branching/RefinementOperator.js";

export {
  REFINEMENT_LAYERS,
  layerName,
  assertMonotonicRefinement,
} from "./refinement/RefinementLevel.js";
export { RefinementPolicy, SingularityTreeLimitError } from "./refinement/RefinementPolicy.js";
export { refine, generateHierarchy } from "./refinement/RefinementEngine.js";
export {
  createObservation,
  requiredLevelForNode,
  requiredAngularResolution,
  ADAPTIVE_POLICY_ID,
} from "./refinement/AdaptiveRefinementPolicy.js";
export {
  computeRefinementFeedback,
  applyRefinementFeedback,
  REFINEMENT_FEEDBACK_ID,
} from "./refinement/RefinementFeedback.js";

export { buildTangentFrame, expressInFrame } from "./geometry/TangentSpace.js";
export { createLocalChart, chartPointOnSphere } from "./geometry/LocalChart.js";
export { metricAt, inverseMetricAt, metricSignature, determinant3, trace3 } from "./geometry/MetricTensor.js";
export { christoffel, metricDerivative, christoffelDerivative } from "./geometry/Connection.js";
export { riemannTensor, ricciTensor, ricciScalar } from "./geometry/Curvature.js";
export { generateLeafGeometry, generateAllLeafGeometry } from "./geometry/GeometryFactory.js";

export { chartsAdjacent, buildAdjacency, adjacencyComponents } from "./continuum/ChartAdjacency.js";
export {
  createTransitionMap,
  sampleChartDomain,
  jacobianDet,
} from "./continuum/TransitionMap.js";
export { createManifold, manifoldSummary } from "./continuum/Manifold.js";
export { assembleContinuum, sampleManifoldMesh, CONTINUUM_ASSEMBLER_ID } from "./continuum/ContinuumAssembler.js";

export {
  project4DTo3D,
  projectManifoldTo3D,
  projectManifoldToScreen,
  PROJECTION_LAYER_ID,
} from "./projection/Project4DTo3D.js";

export { createEvidenceRecord, evidenceAnswersWhy } from "./evidence/EvidenceRecord.js";
export { ProvenanceLedger } from "./evidence/ProvenanceLedger.js";

export {
  INVARIANT_IDS,
  invariantPredicates,
  validateInvariants,
  INVARIANT_ENGINE_ID,
} from "./validation/InvariantEngine.js";
export { validateArchitecture } from "./validation/ArchitectureValidator.js";

export {
  initializeRoot,
  createHierarchy,
  runSingularityTree,
  generateDeterminismReport,
  validateTopologyHierarchy,
  generateWorldForObservation,
  refineWorldWithFeedback,
} from "./runtime.js";

export { createTopologySignature, topologyClassOf, recomputeTopologySignature } from "./topology/TopologySignature.js";
export { topologyEquivalent, isTopologyChangeOnly } from "./topology/TopologyEquivalence.js";
export { validateRefinement, validateGlobalTopology } from "./topology/TopologyValidator.js";

export {
  WORLD_ABI_VERSION,
  compileWorldState,
  getWorldManifold,
  getWorldMesh,
  getNodeById,
  getLeafGeometry,
  getLeaves,
  worldDescriptor,
  WorldABI,
} from "./abi/WorldABI.js";
export {
  COMPUTE_ABI_VERSION,
  COMPUTE_LAYOUT,
  computeDescriptor,
  computePayloadToJSON,
  ComputeABI,
} from "./abi/ComputeABI.js";

export { SeedManager, SeededRng, deriveSeed, mulberry32, SINGULARITY_TREE_SEED_BANNER } from "./determinism/SeedManager.js";
export { hashState, stateSignature, configurationHash, combineHashes, canonicalJson } from "./determinism/StateHasher.js";

export const SINGULARITY_TREE_BANNER =
  "singularity-tree-of-yggdrasil.v1 — one root, many states, one emergent continuum";