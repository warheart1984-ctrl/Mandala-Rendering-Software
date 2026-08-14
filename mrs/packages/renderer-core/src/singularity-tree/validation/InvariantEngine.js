/**
 * InvariantEngine — the 10 mandatory invariants of the Singularity Tree.
 *
 *   INV-1 Root Immutability
 *   INV-2 Valid Lineage
 *   INV-3 Monotonic Refinement
 *   INV-4 Thresholded Differentiation
 *   INV-5 Topology Preservation
 *   INV-6 Determinism
 *   INV-7 Self-Similarity
 *   INV-8 Bounded Execution
 *   INV-9 Traceability
 *   INV-10 Separation of Concerns
 *
 * Each predicate returns {ok, details}. validateInvariants runs all ten over
 * a hierarchy and reports per-invariant verdicts.
 *
 * Status: enforced (verified by invariants tests).
 */

import { topologyClassOf } from "../topology/TopologySignature.js";
import { evaluateDifferentiation } from "../differentiation/ThresholdEvaluator.js";

export const INVARIANT_IDS = Object.freeze([
  "INV-ROOT-IMMUTABILITY",
  "INV-LINEAGE",
  "INV-MONOTONIC-REFINEMENT",
  "INV-THRESHOLDED-DIFFERENTIATION",
  "INV-TOPOLOGY-PRESERVATION",
  "INV-DETERMINISM",
  "INV-SELF-SIMILARITY",
  "INV-BOUNDED-EXECUTION",
  "INV-TRACEABILITY",
  "INV-SEPARATION-OF-CONCERNS",
]);

function all(nodes, fn) {
  return nodes.every((n) => fn(n));
}

export const invariantPredicates = {
  "INV-ROOT-IMMUTABILITY": ({ root }) => {
    const ok =
      root !== null &&
      Object.isFrozen(root.state) &&
      root.state.status === "immutable" &&
      root.id === "root";
    return { ok, details: { stateFrozen: ok } };
  },

  "INV-LINEAGE": ({ hierarchy }) => {
    const nodes = hierarchy.allNodes();
    let orphans = 0;
    for (const node of nodes) {
      if (node.id === node.rootId) continue;
      const parentExists = hierarchy.has(node.parentId);
      if (!parentExists) orphans++;
      const lineage = hierarchy.lineageOf(node);
      if (!lineage || lineage[lineage.length - 1] !== node.id) orphans++;
    }
    return { ok: orphans === 0, details: { orphans } };
  },

  "INV-MONOTONIC-REFINEMENT": ({ hierarchy }) => {
    let violations = 0;
    for (const node of hierarchy.allNodes()) {
      for (const child of hierarchy.childrenOf(node.id)) {
        if (child.level !== node.level + 1) violations++;
      }
    }
    return { ok: violations === 0, details: { violations } };
  },

  "INV-THRESHOLDED-DIFFERENTIATION": ({ hierarchy, config }) => {
    let violations = 0;
    for (const node of hierarchy.allNodes()) {
      if (node.isLeaf || node.children.length === 0) continue;
      const gate = evaluateDifferentiation(node.state, config.criticalThreshold);
      if (!gate.differentiate) violations++;
    }
    return { ok: violations === 0, details: { violations, chiC: config.criticalThreshold } };
  },

  "INV-TOPOLOGY-PRESERVATION": ({ hierarchy, config }) => {
    let violations = 0;
    for (const node of hierarchy.allNodes()) {
      const parentClass = topologyClassOf(node);
      for (const child of hierarchy.childrenOf(node.id)) {
        if (topologyClassOf(child) !== parentClass) violations++;
      }
    }
    return {
      ok: violations === 0 || config.allowTopologyChange === true,
      details: { violations, authorizedTopologyChange: config.allowTopologyChange === true },
    };
  },

  "INV-DETERMINISM": ({ determinismReport }) => {
    const ok =
      determinismReport && determinismReport.identical === true &&
      determinismReport.stateHashesEqual === true;
    return {
      ok,
      details: determinismReport ? determinismReport : { identical: false, note: "no comparison" },
    };
  },

  "INV-SELF-SIMILARITY": ({ hierarchy, config }) => {
    let violations = 0;
    for (const node of hierarchy.allNodes()) {
      if (node.id === node.rootId) continue; // the root defines the law; branches obey it
      const cls = node.generationMetadata.selfSimilarityClass;
      if (cls !== config.selfSimilarityClass) violations++;
      if (node.generationMetadata.generationRule !== "branching.power-law.v1") violations++;
    }
    return { ok: violations === 0, details: { violations, classC: config.selfSimilarityClass } };
  },

  "INV-BOUNDED-EXECUTION": ({ hierarchy, summary, config }) => {
    const ok =
      hierarchy.size() <= config.maxNodes &&
      hierarchy.maxDepth() <= config.maxDepth &&
      (summary ? summary.expansions <= config.maxExpansions : true);
    return {
      ok,
      details: {
        nodes: hierarchy.size(),
        maxNodes: config.maxNodes,
        maxDepth: hierarchy.maxDepth(),
        depthLimit: config.maxDepth,
      },
    };
  },

  "INV-TRACEABILITY": ({ hierarchy, ledger }) => {
    let untraceable = 0;
    for (const node of hierarchy.allNodes()) {
      const hasParent = node.id === node.rootId || hierarchy.has(node.parentId);
      const evidenceOk = ledger ? ledger.getEvidence(node.id).length > 0 || node.id === node.rootId : true;
      if (!hasParent || !evidenceOk) untraceable++;
    }
    return { ok: untraceable === 0, details: { untraceable } };
  },

  "INV-SEPARATION-OF-CONCERNS": ({ runtime }) => {
    const ok = runtime === null || runtime.renderingParticipatedInGeneration !== true;
    return {
      ok,
      details: { renderingParticipatedInGeneration: runtime ? runtime.renderingParticipatedInGeneration : false },
    };
  },
};

export function validateInvariants({
  root,
  hierarchy,
  config,
  ledger = null,
  determinismReport = null,
  summary = null,
  runtime = null,
}) {
  const results = {};
  for (const id of INVARIANT_IDS) {
    const { ok, details } = invariantPredicates[id]({
      root,
      hierarchy,
      config,
      ledger,
      determinismReport,
      summary,
      runtime,
    });
    results[id] = { ok, details };
  }
  const passed = INVARIANT_IDS.filter((id) => results[id].ok).length;
  return {
    passed,
    total: INVARIANT_IDS.length,
    ok: passed === INVARIANT_IDS.length,
    results,
  };
}

export const INVARIANT_ENGINE_ID = "invariant-engine.v1";