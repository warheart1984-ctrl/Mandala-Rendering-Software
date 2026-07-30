/**
 * CKL Amendment VII — Biometric and Organic Rendering Enforcement (humans)
 * plus World-Profile Law registration (kind: world-profile).
 *
 * Evaluation helpers for world.* live in `./amendmentVIII.js` (shared SoT);
 * registration shape matches the user patch under `amendmentVII.policies`.
 *
 * Status:
 * - Human biometric/scale/organic: **enforced** (opt-in biometricAmendment).
 * - World-profile registration + evaluate: **partial**.
 */

export {
  verifyScalStep,
  WORLD_PROFILE_HALT_CODES,
  WORLD_PROFILE_POLICY_IDS,
  WORLD_PROFILE_ORDER,
  loadWorldProfile,
  evaluateWorldProfilePolicy,
  evaluateWorldProfileOrdered,
} from "./amendmentVIII.js";

export const AMENDMENT_VII_ID = "ckl-amendment-vii-biometric-organic";

export const HALT_CODES = Object.freeze({
  BIOMETRIC: "HALT:BIOMETRIC-NONCONFORMANCE",
  MISSING_SCALE: "HALT:MISSING-SCALE-CONTEXT",
  ORGANIC_VARIANCE: "HALT:ORGANIC-VARIANCE-VIOLATION",
  MISSING_WORLD_CONTEXT: "HALT:MISSING-WORLD-CONTEXT",
  WORLD_PROFILE_NONCONFORMANCE: "HALT:WORLD-PROFILE-NONCONFORMANCE",
  ENVIRONMENTAL_VARIANCE: "HALT:ENVIRONMENTAL-VARIANCE-VIOLATION",
  MISSING_MATERIAL_CONTEXT: "HALT:MISSING-MATERIAL-CONTEXT",
});

export const POLICY_IDS = Object.freeze({
  BIOMETRIC: "policy-biometric-conformance",
  ADAPTIVE_SCALE: "policy-adaptive-scale",
  ORGANIC_VARIANCE: "policy-organic-variance",
});

/** Short alias → concrete policy id (matches amendmentVII.order.json). */
export const POLICY_ALIAS = Object.freeze({
  biometric: POLICY_IDS.BIOMETRIC,
  adaptiveScale: POLICY_IDS.ADAPTIVE_SCALE,
  organicVariance: POLICY_IDS.ORGANIC_VARIANCE,
  "world.biogeometric": "world.biogeometric",
  "world.scaleContext": "world.scaleContext",
  "world.architecture": "world.architecture",
  "world.terrain": "world.terrain",
  "world.water": "world.water",
  "world.plant": "world.plant",
  "world.synthetic": "world.synthetic",
  "world.material": "world.material",
  "world.variance": "world.variance",
});

/**
 * Canonical order (user patch). Human triad then world profiles.
 * Apply soft-path uses a related sequence (scaleContext before biogeometric).
 */
export const AMENDMENT_VII_FULL_ORDER = Object.freeze([
  "biometric",
  "adaptiveScale",
  "organicVariance",
  "world.biogeometric",
  "world.scaleContext",
  "world.architecture",
  "world.terrain",
  "world.water",
  "world.plant",
  "world.synthetic",
  "world.material",
  "world.variance",
]);

/** Evaluation order (Amendment VII human triad only). */
export const AMENDMENT_VII_ORDER = Object.freeze([
  POLICY_IDS.BIOMETRIC,
  POLICY_IDS.ADAPTIVE_SCALE,
  POLICY_IDS.ORGANIC_VARIANCE,
]);

/**
 * User-patch registration shape: kind world-profile + haltOn deny.world.*.
 * Keep existing biometric / adaptiveScale / organicVariance; world.biogeometric
 * requires biometric + adaptiveScale.
 */
export const amendmentVII = Object.freeze({
  id: "amendmentVII",
  amendmentId: AMENDMENT_VII_ID,
  order: AMENDMENT_VII_FULL_ORDER,
  policies: Object.freeze({
    biometric: Object.freeze({
      id: POLICY_IDS.BIOMETRIC,
      alias: "biometric",
      kind: "biometric",
      haltOn: ["deny.biometric", HALT_CODES.BIOMETRIC],
    }),
    adaptiveScale: Object.freeze({
      id: POLICY_IDS.ADAPTIVE_SCALE,
      alias: "adaptiveScale",
      kind: "adaptive-scale",
      haltOn: ["deny.adaptiveScale", HALT_CODES.MISSING_SCALE],
    }),
    organicVariance: Object.freeze({
      id: POLICY_IDS.ORGANIC_VARIANCE,
      alias: "organicVariance",
      kind: "organic-variance",
      haltOn: ["deny.organicVariance", HALT_CODES.ORGANIC_VARIANCE],
    }),
    "world.biogeometric": Object.freeze({
      id: "world.biogeometric",
      kind: "world-profile",
      requires: ["biometric", "adaptiveScale"],
      haltOn: ["deny.world.biogeometric"],
    }),
    "world.scaleContext": Object.freeze({
      id: "world.scaleContext",
      kind: "world-profile",
      haltOn: ["deny.world.scaleContext"],
    }),
    "world.architecture": Object.freeze({
      id: "world.architecture",
      kind: "world-profile",
      haltOn: ["deny.world.architecture"],
    }),
    "world.terrain": Object.freeze({
      id: "world.terrain",
      kind: "world-profile",
      haltOn: ["deny.world.terrain"],
    }),
    "world.water": Object.freeze({
      id: "world.water",
      kind: "world-profile",
      haltOn: ["deny.world.water"],
    }),
    "world.plant": Object.freeze({
      id: "world.plant",
      kind: "world-profile",
      haltOn: ["deny.world.plant"],
    }),
    "world.synthetic": Object.freeze({
      id: "world.synthetic",
      kind: "world-profile",
      haltOn: ["deny.world.synthetic"],
    }),
    "world.material": Object.freeze({
      id: "world.material",
      kind: "world-profile",
      haltOn: ["deny.world.material"],
    }),
    "world.variance": Object.freeze({
      id: "world.variance",
      kind: "world-profile",
      haltOn: ["deny.world.variance"],
    }),
  }),
});

/** Enabled world-profile policy ids (for bridge enablePolicy). */
export const ENABLED_WORLD_PROFILE_POLICIES = Object.freeze([
  "world.biogeometric",
  "world.scaleContext",
  "world.architecture",
  "world.terrain",
  "world.water",
  "world.plant",
  "world.synthetic",
  "world.material",
  "world.variance",
]);

export function resolvePolicyId(aliasOrId) {
  if (POLICY_ALIAS[aliasOrId]) return POLICY_ALIAS[aliasOrId];
  return aliasOrId;
}

export function getAmendmentVIIPolicyMeta(aliasOrId) {
  const key =
    aliasOrId in amendmentVII.policies
      ? aliasOrId
      : Object.keys(amendmentVII.policies).find(
          (k) => amendmentVII.policies[k].id === aliasOrId,
        );
  return key ? amendmentVII.policies[key] : null;
}


const RENDER_KINDS = new Set([
  "render_4d_tesseract",
  "render.session",
  "artifact.picture",
  "artifact.movie",
  "play_timeline",
  "render_fixture",
  "render.organic",
  "accept_biometric_conformance",
]);

/**
 * @param {unknown} value
 * @param {{ min: number, max: number }} range
 */
export function inRange(value, range) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    range &&
    typeof range.min === "number" &&
    typeof range.max === "number" &&
    value >= range.min &&
    value <= range.max
  );
}

/**
 * @param {object|null|undefined} intent
 * @param {object|null|undefined} evidence
 */
export function extractAmendmentVIIContext(intent, evidence) {
  const fromEvidence =
    evidence?.biometricAmendment ??
    evidence?.amendmentVII ??
    evidence?.biometric ??
    null;
  const fromIntent =
    intent?.params?.biometricAmendment ??
    intent?.biometricAmendment ??
    intent?.params?.amendmentVII ??
    null;
  const ctx = fromEvidence ?? fromIntent ?? null;
  const hasFixtures = Array.isArray(ctx?.fixtures) && ctx.fixtures.length > 0;
  const enforce =
    intent?.params?.enforceAmendmentVII === true ||
    intent?.enforceAmendmentVII === true ||
    evidence?.enforceAmendmentVII === true ||
    ctx?.enforce === true ||
    intent?.type === "accept_biometric_conformance" ||
    intent?.kind === "accept_biometric_conformance" ||
    hasFixtures;

  return { ctx, enforce, active: Boolean(ctx) || enforce, hasFixtures };
}

/**
 * @param {object|null|undefined} intent
 */
export function isRenderLikeIntent(intent) {
  if (!intent) return false;
  return RENDER_KINDS.has(intent.type ?? intent.kind);
}

/**
 * Resolve scaleClass: declare or inherit from parent/world context.
 * @param {object} fixture
 * @param {object|null|undefined} ctx
 */
export function resolveFixtureScaleClass(fixture, ctx) {
  return (
    fixture?.scaleClass ??
    fixture?.inheritedScaleClass ??
    fixture?.parentScaleClass ??
    ctx?.worldScaleClass ??
    ctx?.parentScaleClass ??
    null
  );
}

/**
 * §1 biometric: when scaleClass is present, metrics must ⊆ profile(scaleClass).
 * Missing scaleClass is deferred to §2 (adaptive-scale).
 *
 * @param {object} fixture
 * @param {object|null|undefined} ctx
 */
export function validateFixtureBiometric(fixture, ctx) {
  const issues = [];
  const checks = [];
  const profile = fixture?.profile ?? fixture?.biometricProfile ?? null;
  const scaleClass = resolveFixtureScaleClass(fixture, ctx);
  const profileId =
    fixture?.biometricProfileId ?? profile?.id ?? scaleClass ?? null;

  if (!scaleClass) {
    return {
      ok: true,
      skipped: true,
      reason: "no-scaleClass-defer-to-adaptive-scale",
      profileId,
      scaleClass: null,
      issues: [],
      checks: [],
    };
  }

  if (!profile && !fixture?.ranges) {
    issues.push("missing-biometricProfile");
  }

  const ranges = fixture?.ranges ?? {
    limbRatios: profile?.limbRatios,
    curvature: profile?.curvature,
    massDistribution: profile?.massDistribution,
  };
  const metrics = fixture?.metrics ?? {};

  const add = (key, value, range) => {
    if (value === undefined || value === null || !range) return;
    const ok = inRange(value, range);
    checks.push({ key, value, ok, range });
    if (!ok) issues.push(`${key}=${value} outside [${range.min},${range.max}]`);
  };

  const limb = metrics.limbRatio ?? metrics.limbRatios ?? metrics;
  const curv = metrics.curvature ?? metrics;
  const mass = metrics.massDistribution ?? metrics;

  if (ranges?.limbRatios) {
    add("armToHeight", limb.armToHeight, ranges.limbRatios.armToHeight);
    add("legToHeight", limb.legToHeight, ranges.limbRatios.legToHeight);
    add("torsoToHeight", limb.torsoToHeight, ranges.limbRatios.torsoToHeight);
    add("headToHeight", limb.headToHeight, ranges.limbRatios.headToHeight);
  }
  if (ranges?.curvature) {
    add(
      "asymmetry",
      curv.asymmetry ?? curv.maxAsymmetry,
      ranges.curvature.maxAsymmetry,
    );
    add(
      "organicVariance",
      curv.organicVariance ?? metrics.organicVariance,
      ranges.curvature.minOrganicVariance,
    );
    add(
      "surfaceCurvatureProxy",
      curv.surfaceCurvatureProxy,
      ranges.curvature.surfaceCurvatureProxy,
    );
  }
  if (ranges?.massDistribution) {
    add(
      "centerOfMassHeightFraction",
      mass.centerOfMassHeightFraction,
      ranges.massDistribution.centerOfMassHeightFraction,
    );
    add(
      "shoulderToHipWidth",
      mass.shoulderToHipWidth,
      ranges.massDistribution.shoulderToHipWidth,
    );
    add(
      "chestDepthToWidth",
      mass.chestDepthToWidth,
      ranges.massDistribution.chestDepthToWidth,
    );
  }

  if (checks.length === 0 && issues.length === 0) {
    issues.push("no-metrics-to-validate");
  }

  return {
    ok: issues.length === 0,
    skipped: false,
    profileId,
    scaleClass,
    issues,
    checks,
  };
}

/**
 * §2 adaptive-scale: fixtures must declare or inherit scaleClass.
 * @param {object} fixture
 * @param {object|null|undefined} ctx
 */
export function validateFixtureScale(fixture, ctx) {
  const scaleClass = resolveFixtureScaleClass(fixture, ctx);
  if (!scaleClass || typeof scaleClass !== "string" || !String(scaleClass).trim()) {
    return {
      ok: false,
      haltCode: HALT_CODES.MISSING_SCALE,
      issues: ["missing-scale-context"],
      scaleClass: null,
    };
  }
  return { ok: true, scaleClass, issues: [], haltCode: null };
}

/**
 * §3 organic variance at render time.
 * @param {object} fixture
 */
export function validateFixtureOrganicVariance(fixture) {
  const profile = fixture?.profile ?? fixture?.biometricProfile ?? null;
  const minRange =
    fixture?.ranges?.curvature?.minOrganicVariance ??
    profile?.curvature?.minOrganicVariance ??
    null;
  const min =
    typeof fixture?.minOrganicVariance === "number"
      ? fixture.minOrganicVariance
      : minRange?.min;

  const measured =
    typeof fixture?.organicVarianceMeasured === "number"
      ? fixture.organicVarianceMeasured
      : typeof fixture?.metrics?.organicVariance === "number"
        ? fixture.metrics.organicVariance
        : typeof fixture?.metrics?.curvature?.organicVariance === "number"
          ? fixture.metrics.curvature.organicVariance
          : undefined;

  if (fixture?.symmetryAveraged === true || fixture?.lrAveraged === true) {
    return {
      ok: false,
      haltCode: HALT_CODES.ORGANIC_VARIANCE,
      issues: ["lr-vertices-averaged"],
      measured,
      min,
    };
  }

  if (typeof min !== "number" || !Number.isFinite(min)) {
    return {
      ok: false,
      haltCode: HALT_CODES.ORGANIC_VARIANCE,
      issues: ["missing-minOrganicVariance"],
      measured,
      min,
    };
  }

  if (typeof measured !== "number" || !Number.isFinite(measured)) {
    return {
      ok: false,
      haltCode: HALT_CODES.ORGANIC_VARIANCE,
      issues: ["missing-organicVariance-measurement"],
      measured,
      min,
    };
  }

  if (measured < min) {
    return {
      ok: false,
      haltCode: HALT_CODES.ORGANIC_VARIANCE,
      issues: [`organicVariance=${measured} < min=${min}`],
      measured,
      min,
    };
  }

  return { ok: true, haltCode: null, issues: [], measured, min };
}

/**
 * @param {object} args
 */
export function buildAuditReceipt({
  policyId,
  haltCode,
  fixtureId,
  issues,
  intentId,
}) {
  return {
    schema: "ckl.amendment-vii.audit-receipt.v1",
    amendment: AMENDMENT_VII_ID,
    policyId,
    haltCode,
    fixtureId: fixtureId ?? null,
    intentId: intentId ?? null,
    issues: Array.isArray(issues) ? issues.slice() : [],
    at: new Date().toISOString(),
    status: "enforced",
  };
}

function denyResult(policyId, haltCode, fixture, issues, intent, extra = {}) {
  return {
    applies: true,
    ok: false,
    policyId,
    haltCode,
    auditReceipt: buildAuditReceipt({
      policyId,
      haltCode,
      fixtureId: fixture?.id,
      issues,
      intentId: intent?.id,
    }),
    issues,
    ...extra,
  };
}

/**
 * Evaluate a single Amendment VII policy against intent/evidence.
 *
 * @param {string} policyId
 * @param {object|null|undefined} intent
 * @param {object|null|undefined} evidence
 */
export function evaluateAmendmentVIIPolicy(policyId, intent, evidence) {
  const { ctx, enforce, active, hasFixtures } = extractAmendmentVIIContext(
    intent,
    evidence,
  );

  if (!AMENDMENT_VII_ORDER.includes(policyId)) {
    return { applies: false, ok: true };
  }

  if (!active && !enforce) {
    return { applies: false, ok: true };
  }

  if (
    !isRenderLikeIntent(intent) &&
    !enforce &&
    intent?.type !== "accept_biometric_conformance"
  ) {
    return { applies: false, ok: true };
  }

  const fixtures = Array.isArray(ctx?.fixtures)
    ? ctx.fixtures
    : Array.isArray(evidence?.fixtures)
      ? evidence.fixtures
      : [];

  if (enforce && !hasFixtures && fixtures.length === 0) {
    if (policyId === POLICY_IDS.ADAPTIVE_SCALE) {
      return denyResult(
        POLICY_IDS.ADAPTIVE_SCALE,
        HALT_CODES.MISSING_SCALE,
        null,
        ["enforceAmendmentVII-but-no-fixtures"],
        intent,
      );
    }
    // Earlier policies: biometric has nothing to check; organic same.
    if (policyId === POLICY_IDS.BIOMETRIC) {
      return { applies: true, ok: true, skipped: true };
    }
    if (policyId === POLICY_IDS.ORGANIC_VARIANCE) {
      return { applies: true, ok: true, skipped: true };
    }
  }

  for (const fixture of fixtures) {
    if (policyId === POLICY_IDS.BIOMETRIC) {
      const bio = validateFixtureBiometric(fixture, ctx);
      if (bio.skipped) continue;
      if (!bio.ok) {
        return denyResult(
          POLICY_IDS.BIOMETRIC,
          HALT_CODES.BIOMETRIC,
          fixture,
          bio.issues,
          intent,
          { checks: bio.checks },
        );
      }
    }

    if (policyId === POLICY_IDS.ADAPTIVE_SCALE) {
      const scale = validateFixtureScale(fixture, ctx);
      if (!scale.ok) {
        return denyResult(
          POLICY_IDS.ADAPTIVE_SCALE,
          HALT_CODES.MISSING_SCALE,
          fixture,
          scale.issues,
          intent,
        );
      }
    }

    if (policyId === POLICY_IDS.ORGANIC_VARIANCE) {
      const organic = validateFixtureOrganicVariance(fixture);
      if (!organic.ok) {
        return denyResult(
          POLICY_IDS.ORGANIC_VARIANCE,
          HALT_CODES.ORGANIC_VARIANCE,
          fixture,
          organic.issues,
          intent,
          { measured: organic.measured, min: organic.min },
        );
      }
    }
  }

  return { applies: true, ok: true, policyId };
}

/**
 * Full ordered evaluation (biometric → adaptive-scale → organic-variance).
 * Returns first halt.
 */
export function evaluateAmendmentVIIOrdered(intent, evidence) {
  for (const policyId of AMENDMENT_VII_ORDER) {
    const result = evaluateAmendmentVIIPolicy(policyId, intent, evidence);
    if (result.applies && !result.ok) return result;
  }
  const { active, enforce } = extractAmendmentVIIContext(intent, evidence);
  return { applies: active || enforce, ok: true };
}
