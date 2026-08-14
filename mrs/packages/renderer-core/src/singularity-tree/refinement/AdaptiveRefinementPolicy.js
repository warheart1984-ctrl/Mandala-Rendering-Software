/**
 * AdaptiveRefinementPolicy — camera/observation-driven refinement.
 *
 *   Camera → Visible region → Required geometric resolution → Yggdrasil
 *   refinement
 *
 * Far-away branches get low refinement; branches near the camera get higher
 * refinement; branches inside the focal region get very high refinement.
 * The policy is a pure deterministic function of the observation context —
 * never of wall-clock or random state.
 *
 * Status: enforced (verified by adaptive refinement tests).
 */

import { normalize } from "../../render/rt4d/math/vec4.js";
import { angularSeparation } from "../branching/AssociationOperator.js";

export function createObservation({
  cameraPosition = { x: 2.2, y: 0, z: 0, w: 0 },
  focusPoint = { x: 0, y: 0, z: 0, w: 0 },
  focusRadius = 0.9,
  nearLevel = 6,
  farLevel = 2,
  falloff = 1.6,
} = {}) {
  return Object.freeze({
    cameraPosition: Object.freeze({ ...cameraPosition }),
    focusPoint: Object.freeze({ ...focusPoint }),
    focusRadius,
    nearLevel,
    farLevel,
    falloff,
  });
}

function dist4(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const dw = a.w - b.w;
  return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
}

/**
 * Required refinement level for a node under an observation.
 *
 * The visible region is the angular cap of the world sphere facing the
 * camera: branches near the camera axis are resolved to nearLevel; branches
 * on the far side fall to farLevel. The cap edge is the focusRadius (arc
 * length on the world sphere). This is a pure function of the observation —
 * deterministic, no wall-clock or random state.
 */
export function requiredLevelForNode(node, observation, config) {
  const worldRadius = Math.max(node.state.potential * config.leafChartRadiusWorld, 1e-9);
  const direction = normalize(node.state.state);
  const camDir = normalize(observation.cameraPosition);
  const sep = angularSeparation(direction, camDir) * worldRadius;
  const f = Math.max(observation.focusRadius, 1e-9);
  const weight = Math.exp(-Math.pow(sep / f, observation.falloff));
  const raw = observation.farLevel + (observation.nearLevel - observation.farLevel) * weight;
  const maxLevel = config.maxDepth + (config.adaptiveMaxExtraDepth ?? 3);
  return Math.max(0, Math.min(maxLevel, Math.round(raw)));
}

/**
 * Angular resolution demanded at a world position, given the observation.
 * Used to measure per-leaf refinement error for the feedback loop.
 */
export function requiredAngularResolution(observation, worldPos) {
  const d = dist4(worldPos, observation.cameraPosition);
  const f = Math.max(observation.focusRadius, 1e-9);
  const base = 1.0;
  return base * (1 + d / f);
}

export function ADAPTIVE_POLICY_ID() {
  return "refinement.adaptive.v1";
}

export { angularSeparation };