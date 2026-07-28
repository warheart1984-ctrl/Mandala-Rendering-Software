/**
 * Observation mode presets for ProjCC.
 *
 * Labels: observation / preview assist only — not Digital Printer / beauty print.
 * SoT: Projector4D remains math/print SoT. Aperture ≠ print.
 *
 * Status: enforced for core + orbit + soft_caustic resolve behavior (unit suite).
 */

import { createProjectionState } from "./ProjectionState.js";
import {
  OBSERVATION_MODE_IDS,
  PROJECTION_POLICY_IDS,
  mapObservationModeChoice,
} from "../../../live-link/shadingWire.js";

export const OBSERVATION_PRESET_BANNER =
  "Observation mode — assist/preview only; CPU RT4D print remains SoT. Aperture ≠ print.";

/**
 * Canonical preset table (PLP mode ids + continuous defaults).
 * @type {Readonly<Record<string, object>>}
 */
export const OBSERVATION_MODE_PRESETS = Object.freeze({
  perspective_w: Object.freeze({
    modeId: "perspective_w",
    liveLinkChoice: "Perspective4DTo3D",
    theta: 0,
    phi: 0,
    tau: 0,
    kappa: 0,
    description:
      "Classic perspective_w observation (identity continuous params) — not print SoT",
    label: "Perspective W (observation)",
    banner: OBSERVATION_PRESET_BANNER,
    printSoT: false,
    authority: "observation",
    status: "enforced",
  }),
  slice_hyperplane: Object.freeze({
    modeId: "slice_hyperplane",
    liveLinkChoice: "WSliceConstant",
    theta: 0,
    phi: 0,
    tau: 0,
    kappa: 0,
    description:
      "W-slice / hyperplane observation; τ selects slice offset — not print SoT",
    label: "W-Slice (observation)",
    banner: OBSERVATION_PRESET_BANNER,
    printSoT: false,
    authority: "observation",
    status: "enforced",
  }),
  intentional_orbit: Object.freeze({
    modeId: "intentional_orbit",
    liveLinkChoice: "Perspective4DTo3D",
    theta: Math.PI / 6,
    phi: Math.PI / 4,
    tau: 0,
    kappa: 0,
    description:
      "Intentional orbit observation — continuous view angles non-zero; aperture ≠ print",
    label: "Intentional Orbit (observation)",
    banner: OBSERVATION_PRESET_BANNER,
    printSoT: false,
    authority: "observation",
    status: "enforced",
  }),
  soft_caustic: Object.freeze({
    modeId: "soft_caustic",
    liveLinkChoice: "Perspective4DTo3D",
    theta: 0,
    phi: 0,
    tau: 0,
    kappa: 0.5,
    description:
      "Soft κ aperture weight observation — caustic assist/preview; not print SoT",
    label: "Soft Caustic (observation)",
    banner: OBSERVATION_PRESET_BANNER,
    printSoT: false,
    authority: "observation",
    status: "enforced",
  }),
});

/**
 * @param {string} modeId
 * @param {import("./ProjectionState.js").ProjectionStateInit} [overrides]
 */
export function resolveObservationPreset(modeId, overrides = {}) {
  const preset = OBSERVATION_MODE_PRESETS[modeId];
  if (!preset) {
    throw new Error(`Unknown observation mode preset: ${modeId}`);
  }
  const live = mapObservationModeChoice(preset.liveLinkChoice);
  // Drop undefined overrides so callers may pass sparse opts without clobbering
  // preset theta/phi/tau/kappa/width/height (P0: intentional_orbit / soft_caustic).
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  );
  const state = createProjectionState({
    modeId: preset.modeId,
    theta: preset.theta,
    phi: preset.phi,
    tau: preset.tau,
    kappa: preset.kappa,
    status: preset.status === "enforced" ? "partial" : preset.status,
    ...definedOverrides,
  });
  return Object.freeze({
    preset,
    state,
    observationModeId: live.observationModeId,
    projectionPolicyId: live.projectionPolicyId,
    printSoT: false,
    authority: "observation",
    banner: OBSERVATION_PRESET_BANNER,
  });
}

export function listObservationPresets() {
  return Object.keys(OBSERVATION_MODE_PRESETS);
}

export { OBSERVATION_MODE_IDS, PROJECTION_POLICY_IDS };
