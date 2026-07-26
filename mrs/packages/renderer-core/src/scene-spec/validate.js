/**
 * Capability validation — what the RT4D / PLP backends actually support.
 */

import { parseSceneSpecification } from "./parse.js";
import { joinPath, fail, ok } from "./helpers.js";

/** Observation modes accepted for PLP projectWorld. */
export const SUPPORTED_OBSERVATION_MODES = Object.freeze([
  "perspective_w",
  "slice_hyperplane",
]);

/** Surface ids the RT4D still converter can expand to primitives. */
export const RT4D_SURFACE_IDS = Object.freeze([
  "tesseract",
  "clifford-torus",
  "clifford_torus",
  "central-orb",
  "lattice-grid",
  "torus-ring",
  "orbital-cluster",
  "hopf-surface",
  "hopf_surface",
  "trefoil-4d",
  "trefoil_4d",
  "torus-3d",
  "torus_3d",
]);

export const MAX_WIDTH = 1024;
export const MAX_HEIGHT = 1024;
export const MAX_SAMPLES = 512;
export const MAX_DEPTH = 12;
export const MAX_ANIMATION_FRAMES = 240;

const SURFACE_ALIASES = {
  clifford_torus: "clifford-torus",
  hopf_surface: "hopf-surface",
  trefoil_4d: "trefoil-4d",
  torus_3d: "torus-3d",
};

export function normalizeSurfaceId(id) {
  if (!id) return null;
  return SURFACE_ALIASES[id] ?? id;
}

/**
 * @param {unknown} value — raw or already-parsed spec
 * @param {{ target?: "rt4d"|"plp"|"both" }} [options]
 * @returns {import("./helpers.js").ValidationResult}
 */
export function validateSceneCapabilities(value, options = {}) {
  const target = options.target ?? "both";
  const structural = parseSceneSpecification(value);
  if (!structural.ok) return structural;

  const spec = structural.value;
  /** @type {import("./helpers.js").ValidationIssue[]} */
  const errors = [];

  if (spec.defaultObservation?.modeId) {
    if (!SUPPORTED_OBSERVATION_MODES.includes(spec.defaultObservation.modeId)) {
      errors.push({
        path: "defaultObservation.modeId",
        message: `unsupported observation mode (supported: ${SUPPORTED_OBSERVATION_MODES.join(", ")})`,
      });
    }
  }

  const out = spec.output ?? {};
  if (out.width != null && out.width > MAX_WIDTH) {
    errors.push({ path: "output.width", message: `exceeds cap ${MAX_WIDTH}` });
  }
  if (out.height != null && out.height > MAX_HEIGHT) {
    errors.push({ path: "output.height", message: `exceeds cap ${MAX_HEIGHT}` });
  }
  if (out.samples != null && out.samples > MAX_SAMPLES) {
    errors.push({ path: "output.samples", message: `exceeds cap ${MAX_SAMPLES}` });
  }
  if (out.maxDepth != null && out.maxDepth > MAX_DEPTH) {
    errors.push({ path: "output.maxDepth", message: `exceeds cap ${MAX_DEPTH}` });
  }

  if (spec.animation) {
    const frames = Math.floor(spec.animation.duration * spec.animation.fps) + 1;
    if (frames > MAX_ANIMATION_FRAMES) {
      errors.push({
        path: "animation",
        message: `frame count ${frames} exceeds cap ${MAX_ANIMATION_FRAMES}`,
      });
    }
  }

  const entities = Array.isArray(spec.entities) ? spec.entities : [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const geom = e?.geometry ?? {};
    const gpath = joinPath("entities", i) + ".geometry";

    if (target === "rt4d" || target === "both") {
      if (geom.kind === "meshRef" || geom.kind === "sdfRef") {
        errors.push({
          path: gpath + ".kind",
          message: `RT4D still path does not support ${geom.kind} (use surface|hypersphere|hyperplane)`,
        });
      }
      if (geom.kind === "surface") {
        const sid = normalizeSurfaceId(geom.surfaceId);
        if (!RT4D_SURFACE_IDS.includes(geom.surfaceId) && !RT4D_SURFACE_IDS.includes(sid)) {
          errors.push({
            path: gpath + ".surfaceId",
            message: `unsupported RT4D surfaceId "${geom.surfaceId}"`,
          });
        }
      }
    }
  }

  if (Array.isArray(spec.lights)) {
    for (let i = 0; i < spec.lights.length; i++) {
      const L = spec.lights[i];
      if (L?.type && L.type !== "hypersphere") {
        errors.push({
          path: joinPath("lights", i) + ".type",
          message: "only hypersphere lights are supported",
        });
      }
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok(spec);
}
