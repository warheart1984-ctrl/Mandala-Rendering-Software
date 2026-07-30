/**
 * CL-Gen constitutional wrap — Amendment VII/VIII before OpenCL dispatch.
 *
 * STATUS: **partial**
 * - Soft apply: biometric → adaptiveScale → organicVariance → world.scaleContext
 *   → world.architecture (dim-room default) via CKL evaluate helpers.
 * - HALT on CKL deny; never invent pixels after deny.
 * - Does not mutate charter.js / default.policies.json.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../../../");
const require = createRequire(import.meta.url);

export const CL_GEN_CAPABILITY = "image.gen.opencl";
export const CL_GEN_PROVIDER = "opencl.gen";

/** Minimal human-adult profile slice (mirrors amendment-vii.test.js). */
const HUMAN_PROFILE = {
  id: "human-adult-v1",
  scaleClass: "human-sized",
  limbRatios: {
    armToHeight: { min: 0.3, max: 0.48 },
    legToHeight: { min: 0.4, max: 0.55 },
    torsoToHeight: { min: 0.28, max: 0.4 },
    headToHeight: { min: 0.1, max: 0.16 },
  },
  curvature: {
    maxAsymmetry: { min: 0, max: 0.08 },
    minOrganicVariance: { min: 0.002, max: 1 },
    surfaceCurvatureProxy: { min: 0.35, max: 1.2 },
  },
  massDistribution: {
    centerOfMassHeightFraction: { min: 0.45, max: 0.62 },
    shoulderToHipWidth: { min: 0.85, max: 1.45 },
  },
};

const LAWFUL_BIO_METRICS = {
  armToHeight: 0.4,
  legToHeight: 0.48,
  torsoToHeight: 0.34,
  headToHeight: 0.13,
  asymmetry: 0.02,
  organicVariance: 0.01,
  surfaceCurvatureProxy: 0.6,
  centerOfMassHeightFraction: 0.55,
  shoulderToHipWidth: 1.1,
};

/**
 * Default lawful dim-room evidence for CL-Gen stills.
 * @param {object} [overrides]
 */
export function buildClGenLawfulEvidence(overrides = {}) {
  const worldContext = overrides.worldContext || "interior.dim-room";
  const scaleClass = overrides.scaleClass || "human-sized";
  const entity = {
    id: overrides.entityId || "cl-gen-dim-room",
    objectType: "architecture",
    worldProfileId: "world.architecture",
    scaleClass,
    environmentalVarianceMeasured: 0.012,
    architectureContext: {
      profileId: "world.architecture",
      worldScaleClass: scaleClass,
    },
    metrics: {
      roomAspect: 1.2,
      ceilingRatio: 0.85,
    },
    ...(overrides.entity || {}),
  };

  const fixture = {
    id: overrides.fixtureId || "fixture-cl-gen-viewer",
    scaleClass,
    biometricProfileId: "human-adult-v1",
    profile: HUMAN_PROFILE,
    metrics: { ...LAWFUL_BIO_METRICS },
    organicVarianceMeasured: 0.01,
    ...(overrides.fixture || {}),
  };

  return {
    id: overrides.evidenceId || "ev-cl-gen",
    worldId: overrides.worldId || worldContext,
    timelineId: overrides.timelineId || "tl-cl-gen",
    enforceAmendmentVII: overrides.enforceAmendmentVII !== false,
    enforceWorldProfile: overrides.enforceWorldProfile !== false,
    biometricAmendment: {
      enforce: true,
      worldScaleClass: scaleClass,
      fixtures: overrides.fixtures || [fixture],
    },
    worldProfileAmendment: {
      enforce: true,
      worldScaleClass: scaleClass,
      entities: overrides.entities || [entity],
    },
    ...overrides.evidenceExtra,
  };
}

/**
 * @param {object} [overrides]
 */
export function buildClGenIntent(overrides = {}) {
  return {
    id: overrides.intentId || "intent-cl-gen",
    type: "render.world",
    actor: "sx.cl-gen",
    action: "image.gen.opencl",
    world: overrides.worldId || "interior.dim-room",
    enforceAmendmentVII: true,
    enforceWorldProfile: true,
    ...overrides,
  };
}

function loadAmendmentModules() {
  const viiPath = join(repoRoot, "engine/governance/biometric/amendmentVII.js");
  const viiiPath = join(
    repoRoot,
    "engine/governance/biometric/amendmentVIII.js",
  );
  // Dynamic import path via createRequire for CJS interop of ESM — use import().
  return { viiPath, viiiPath };
}

/**
 * Evaluate Amendment VII then VIII; HALT on deny.
 *
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function applyClGenConstitutionalWrap(opts = {}) {
  const intent = buildClGenIntent(opts.intent || {});
  const evidence = buildClGenLawfulEvidence(opts.evidence || {});
  const skip =
    opts.skipConstitutional === true ||
    opts.env?.CL_GEN_SKIP_CONSTITUTIONAL === "1";

  if (skip) {
    return {
      ok: true,
      halted: false,
      skipped: true,
      status: "partial",
      provider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      reason: "constitutional wrap skipped (explicit)",
      intent,
      evidence,
      gates: [],
    };
  }

  const { viiPath, viiiPath } = loadAmendmentModules();
  const vii = await import(`file:///${viiPath.replace(/\\/g, "/")}`);
  const viii = await import(`file:///${viiiPath.replace(/\\/g, "/")}`);

  /** @type {object[]} */
  const gates = [];

  const viiResult = vii.evaluateAmendmentVIIOrdered(intent, evidence);
  gates.push({
    amendment: "VII",
    ok: !!viiResult?.ok,
    haltCode: viiResult?.haltCode || null,
    violations: viiResult?.violations || [],
  });
  if (viiResult && viiResult.ok === false) {
    return {
      ok: false,
      halted: true,
      status: "halted",
      provider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      haltCode: viiResult.haltCode || "AMENDMENT_VII_DENY",
      reason: `CKL Amendment VII deny: ${viiResult.haltCode || "deny"}`,
      intent,
      evidence,
      gates,
      constitutionalLog: {
        imageGenProvider: CL_GEN_PROVIDER,
        localGpuAvailable: true,
        fallbackUsed: false,
        reason: `HALT Amendment VII: ${viiResult.haltCode}`,
      },
    };
  }

  const viiiResult = viii.evaluateWorldProfileOrdered(intent, evidence);
  gates.push({
    amendment: "VIII",
    ok: !!viiiResult?.ok,
    haltCode: viiiResult?.haltCode || null,
    violations: viiiResult?.violations || [],
  });
  if (viiiResult && viiiResult.ok === false) {
    return {
      ok: false,
      halted: true,
      status: "halted",
      provider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      haltCode: viiiResult.haltCode || "AMENDMENT_VIII_DENY",
      reason: `CKL Amendment VIII deny: ${viiiResult.haltCode || "deny"}`,
      intent,
      evidence,
      gates,
      constitutionalLog: {
        imageGenProvider: CL_GEN_PROVIDER,
        localGpuAvailable: true,
        fallbackUsed: false,
        reason: `HALT Amendment VIII: ${viiiResult.haltCode}`,
      },
    };
  }

  return {
    ok: true,
    halted: false,
    status: "partial",
    provider: CL_GEN_PROVIDER,
    capability: CL_GEN_CAPABILITY,
    reason: "Amendment VII/VIII soft apply allowed",
    intent,
    evidence,
    gates,
    scaleContext: evidence.worldProfileAmendment?.worldScaleClass || null,
    constitutionalLog: {
      imageGenProvider: CL_GEN_PROVIDER,
      localGpuAvailable: true,
      fallbackUsed: false,
      reason: "CL-Gen constitutional wrap passed (VII/VIII)",
    },
  };
}

export default {
  CL_GEN_CAPABILITY,
  CL_GEN_PROVIDER,
  buildClGenLawfulEvidence,
  buildClGenIntent,
  applyClGenConstitutionalWrap,
};
