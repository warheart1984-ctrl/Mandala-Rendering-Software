/**
 * RefinementEngine — refine(node, context) → childNodes.
 *
 * Evaluates:
 *   differentiationPotential, threshold, topology, localGeometry,
 *   branchingRules, maximumDepth, resourceBudget
 *
 *   if differentiationPotential > criticalThreshold:
 *       expand → associate → refine → create next-level nodes
 *   else:
 *       terminate branch (leaf)
 *
 * Recursion is bounded by RefinementPolicy; limits fail closed
 * (SingularityTreeLimitError).
 *
 * Status: enforced (verified by hierarchy, failure, determinism tests).
 */

import { evaluateDifferentiation } from "../differentiation/ThresholdEvaluator.js";
import { branch } from "../branching/BranchingOperator.js";
import { createNode } from "../hierarchy/HierarchyNode.js";
import { Hierarchy } from "../hierarchy/Hierarchy.js";
import { createTopologySignature } from "../topology/TopologySignature.js";
import { validateRefinement } from "../topology/TopologyValidator.js";
import { assertMonotonicRefinement } from "./RefinementLevel.js";
import { RefinementPolicy, SingularityTreeLimitError } from "./RefinementPolicy.js";
import { deriveSeed } from "../determinism/SeedManager.js";
import { requiredLevelForNode } from "./AdaptiveRefinementPolicy.js";

export function refine(node, context) {
  const { hierarchy, config, policy, state, ledger, observation, policyOverride } = context;

  if (!config.enableTopologyValidation) {
    throw new Error("RefinementEngine: enableTopologyValidation must be true for generation");
  }

  const gate = evaluateDifferentiation(node.state, policy.criticalThreshold);
  if (!gate.differentiate) {
    node.isLeaf = true;
    return [];
  }

  // Termination level: either the configured maxDepth, an observation-driven
  // adaptive level (near-camera regions refine deeper than far regions), or a
  // feedback-constraint override. All three are graceful bounded termination
  // boundaries (finite refinement level Lₙ) — not errors.
  let terminationLevel = policy.maxDepth;
  if (config.enableAdaptiveRefinement && observation) {
    terminationLevel = requiredLevelForNode(node, observation, config);
  }
  if (policyOverride && typeof policyOverride.requiredLevelOverride === "function") {
    const override = policyOverride.requiredLevelOverride(node.id);
    if (override !== null && override !== undefined) {
      terminationLevel = Math.max(terminationLevel, override);
    }
  }
  // The root is the generative law: it must differentiate at least once, so a
  // world exists (an empty world is not a valid observation of Yggdrasil).
  if (node.level === 0) terminationLevel = Math.max(terminationLevel, 1);
  if (node.level >= terminationLevel) {
    node.isLeaf = true;
    return [];
  }

  // Resource limits (nodes / expansions / memory) fail closed.
  policy.assertAllowed(node.level, hierarchy.size(), state.expansions);

  const { children: descriptors, branchFactor } = branch(
    node,
    node.generationMetadata.generationSeed,
    config,
  );

  state.expansions += 1;
  if (state.expansions > policy.maxExpansions) {
    if (policy.failClosed) {
      throw new SingularityTreeLimitError(`resource limit reached: maxExpansions=${policy.maxExpansions}`);
    }
    return [];
  }

  const childNodes = [];
  for (const d of descriptors) {
    const branchPath = [...(node.branchPath || []), d.index];
    const id = ["root", ...branchPath].join("/");
    const generationSeed = deriveSeed(node.generationMetadata.generationSeed, d.index, 7);

    const child = createNode({
      id,
      parentId: node.id,
      rootId: node.rootId,
      level: node.level + 1,
      state: d.childState,
      branchPath,
      generationSeed,
      generationRule: "branching.power-law.v1",
      createdBy: config.createdBy,
      selfSimilarityClass: config.selfSimilarityClass,
      associations: d.refinement.associations.map((a) => ({
        withIndex: a.withIndex,
        separation: a.separation,
      })),
      isLeaf: false,
    });
    child.topologySignature = createTopologySignature(child, config);
    child.geometrySignature = null;

    // Associations are resolved to ids after all siblings are created.
    childNodes.push(child);
  }

  for (const child of childNodes) {
    for (const a of child.associations) {
      a.withId = childNodes[a.withIndex].id;
    }
  }

  // Topology preservation + monotonic refinement checks.
  for (const child of childNodes) {
    assertMonotonicRefinement(node, child);
  }
  const topo = validateRefinement(node, childNodes, config);
  if (!topo.ok) {
    throw new Error(`RefinementEngine: topology violation: ${topo.violations.join("; ")}`);
  }

  node.children = childNodes.map((c) => ({ id: c.id }));
  node.isLeaf = false;
  for (const child of childNodes) {
    hierarchy.register(child);
  }

  if (ledger) {
    ledger.recordRefinement(
      node,
      childNodes,
      "branching.power-law.v1",
      node.generationMetadata.generationSeed,
      gate,
    );
  }

  state.childrenByParent = state.childrenByParent || new Map();
  state.childrenByParent.set(node.id, childNodes);

  for (const child of childNodes) {
    refine(child, context);
  }

  return childNodes;
}

/**
 * Generate the entire hierarchy from the root.
 * @param {object} root SingularityRoot
 * @returns {{hierarchy: import("../hierarchy/Hierarchy.js").Hierarchy, summary: object}}
 */
export function generateHierarchy(root, options = {}) {
  const {
    enableEvidence = true,
    ledger = null,
    observation = null,
    policyOverride = null,
  } = options;
  const config = root.config;
  const policy = new RefinementPolicy(config);

  const hierarchy = new Hierarchy(root);
  const state = { expansions: 0, childrenByParent: new Map() };

  refine(root, { hierarchy, config, policy, state, ledger, observation, policyOverride });

  const leaves = hierarchy.leaves();
  const summary = {
    nodes: hierarchy.size(),
    leaves: leaves.length,
    maxDepth: hierarchy.maxDepth(),
    expansions: state.expansions,
    rootId: hierarchy.rootId,
    topologyTarget: config.topologyTarget,
    adaptive: Boolean(observation && config.enableAdaptiveRefinement),
  };

  if (enableEvidence && ledger) {
    ledger.recordGeneration(root, hierarchy, summary);
  }

  return { hierarchy, summary };
}