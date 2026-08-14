/**
 * RefinementFeedback — the observation → refinement policy feedback loop.
 *
 *   WORLD GENERATOR → GEOMETRY → OBSERVATION → ERROR / CONSTRAINT →
 *   REFINEMENT POLICY → WORLD GENERATOR
 *
 * `computeRefinementFeedback` measures per-leaf resolution error against the
 * observation and emits constraint records; `applyRefinementFeedback`
 * regenerates the hierarchy (replayable, same root+seed) with per-region
 * required-level overrides, deepening refinement exactly where the observer
 * demands it.
 *
 * Status: enforced (verified by feedback loop tests).
 */

import { normalize } from "../../render/rt4d/math/vec4.js";
import { requiredAngularResolution } from "./AdaptiveRefinementPolicy.js";
import { createRoot } from "../root/SingularityRoot.js";
import { generateHierarchy } from "./RefinementEngine.js";
import { lineageFromBranchPath } from "../hierarchy/Lineage.js";

function worldPosition(node, config) {
  const r = Math.max(node.state.potential * config.leafChartRadiusWorld, 1e-9);
  const d = normalize(node.state.state);
  return { x: d.x * r, y: d.y * r, z: d.z * r, w: d.w * r };
}

/**
 * Measure per-leaf resolution error vs the observation.
 * @returns {Array<{nodeId, direction, error, requiredLevel, level}>}
 */
export function computeRefinementFeedback(hierarchy, observation, config) {
  const feedback = [];
  for (const leaf of hierarchy.leaves()) {
    const pos = worldPosition(leaf, config);
    const req = requiredAngularResolution(observation, pos);
    const actual = leaf.geometry
      ? leaf.geometry.chart.angularRadius / config.leafSampleResolution
      : req;
    const error = req / Math.max(actual, 1e-9);
    if (error > 1.0) {
      const extra = Math.ceil(Math.log2(error));
      feedback.push({
        nodeId: leaf.id,
        branchPath: leaf.branchPath || [],
        direction: normalize(leaf.state.state),
        error,
        level: leaf.level,
        requiredLevel: Math.min(leaf.level + extra, config.maxDepth + config.adaptiveMaxExtraDepth),
      });
    }
  }
  return feedback;
}

/**
 * Regenerate the hierarchy honoring feedback constraints: branches whose
 * lineage/direction matches a feedback record are refined to at least the
 * required level (region-level override).
 */
export function applyRefinementFeedback(config, feedback, options = {}) {
  const overrides = new Map();
  for (const fb of feedback) {
    if (fb.branchPath && fb.branchPath.length > 0) {
      const id = ["root", ...fb.branchPath].join("/");
      overrides.set(id, fb.requiredLevel);
    }
  }

  const policy = {
    requiredLevelOverride(id) {
      return overrides.has(id) ? overrides.get(id) : null;
    },
    hasOverride() {
      return overrides.size > 0;
    },
  };

  const root = createRoot(config);
  const { hierarchy, summary } = generateHierarchy(root, {
    ledger: options.ledger ?? null,
    policyOverride: policy,
  });

  // The feedback loop is replayable: same root + seed + feedback produces the
  // same hierarchy. Record the loop pass in the summary.
  summary.feedbackApplied = feedback.map((f) => ({
    nodeId: f.nodeId,
    requiredLevel: f.requiredLevel,
  }));
  return { root, hierarchy, summary };
}

export function REFINEMENT_FEEDBACK_ID() {
  return "refinement.feedback.v1";
}

export { lineageFromBranchPath };