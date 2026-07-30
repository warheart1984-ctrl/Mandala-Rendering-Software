/**
 * Policy IDs (SoT in default.policies.json + amendmentVII.order.json):
 *   world.biogeometric, world.scaleContext, world.architecture, world.terrain,
 *   world.water, world.plant, world.synthetic, world.material, world.variance
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const AMENDMENT_VIII_ID = "ckl-amendment-viii-world-profile";
/** @deprecated use AMENDMENT_VIII_ID — policies also registered under amendmentVII */
export const WORLD_PROFILE_AMENDMENT_ID = "ckl-amendment-vii-biometric-organic";

export const WORLD_PROFILE_POLICY_IDS = Object.freeze({
  BIOGEOMETRIC: "world.biogeometric",
  SCALE_CONTEXT: "world.scaleContext",
  ARCHITECTURE: "world.architecture",
  TERRAIN: "world.terrain",
  WATER: "world.water",
  PLANT: "world.plant",
  SYNTHETIC: "world.synthetic",
  MATERIAL: "world.material",
  VARIANCE: "world.variance",
});

/**
 * Policy evaluation order (matches amendmentVII.order / default.policies.json).
 * Apply soft-path runs scaleContext before biogeometric (see AmendmentVIIRenderApply).
 */
export const WORLD_PROFILE_ORDER = Object.freeze([
  WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC,
  WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
  WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
  WORLD_PROFILE_POLICY_IDS.TERRAIN,
  WORLD_PROFILE_POLICY_IDS.WATER,
  WORLD_PROFILE_POLICY_IDS.PLANT,
  WORLD_PROFILE_POLICY_IDS.SYNTHETIC,
  WORLD_PROFILE_POLICY_IDS.MATERIAL,
  WORLD_PROFILE_POLICY_IDS.VARIANCE,
]);

/** Apply-path world kinds after scaleContext + biogeometric (user patch §4). */
export const WORLD_PROFILE_APPLY_REMAINING = Object.freeze([
  WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
  WORLD_PROFILE_POLICY_IDS.TERRAIN,
  WORLD_PROFILE_POLICY_IDS.WATER,
  WORLD_PROFILE_POLICY_IDS.PLANT,
  WORLD_PROFILE_POLICY_IDS.SYNTHETIC,
  WORLD_PROFILE_POLICY_IDS.MATERIAL,
  WORLD_PROFILE_POLICY_IDS.VARIANCE,
]);

export const AMENDMENT_VIII_ORDER = WORLD_PROFILE_ORDER;

export const WORLD_PROFILE_HALT_CODES = Object.freeze({
  MISSING_WORLD_CONTEXT: "HALT:MISSING-WORLD-CONTEXT",
  WORLD_PROFILE_NONCONFORMANCE: "HALT:WORLD-PROFILE-NONCONFORMANCE",
  ENVIRONMENTAL_VARIANCE: "HALT:ENVIRONMENTAL-VARIANCE-VIOLATION",
  MISSING_SCALE: "HALT:MISSING-SCALE-CONTEXT",
  MISSING_MATERIAL_CONTEXT: "HALT:MISSING-MATERIAL-CONTEXT",
});

/** Cross-cutting policies applied to every world entity when gated. */
const CROSS_CUT = new Set([
  WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC,
  WORLD_PROFILE_POLICY_IDS.MATERIAL,
  WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
  WORLD_PROFILE_POLICY_IDS.VARIANCE,
]);

export const POLICY_TO_DOMAIN = Object.freeze({
  [WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC]: "biogeometric",
  [WORLD_PROFILE_POLICY_IDS.TERRAIN]: "terrain",
  [WORLD_PROFILE_POLICY_IDS.ARCHITECTURE]: "architecture",
  [WORLD_PROFILE_POLICY_IDS.WATER]: "water",
  [WORLD_PROFILE_POLICY_IDS.PLANT]: "plant",
  [WORLD_PROFILE_POLICY_IDS.SYNTHETIC]: "synthetic",
  [WORLD_PROFILE_POLICY_IDS.MATERIAL]: "material",
  [WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT]: "scaleContext",
  [WORLD_PROFILE_POLICY_IDS.VARIANCE]: "variance",
});

const RENDER_KINDS = new Set([
  "render_4d_tesseract",
  "render.session",
  "artifact.picture",
  "artifact.movie",
  "play_timeline",
  "render_fixture",
  "render.organic",
  "render.world",
  "accept_world_profile",
]);

export function resolveWorldAssetsRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "..", "mrs", "assets", "world"),
    join(here, "..", "..", "..", "..", "mrs", "assets", "world"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

/**
 * Load a world-profile catalog by policy/domain id (all nine Amendment VIII IDs).
 * @param {string} profileId
 */
export function loadWorldProfile(profileId) {
  const id = String(profileId ?? "").trim();
  const issues = [];
  if (!id) {
    return {
      status: "partial",
      profileId: "",
      profile: null,
      source: "",
      issues: ["missing-world-profile-id"],
    };
  }

  const root = resolveWorldAssetsRoot();
  const dedicated = join(root, "profiles", `${id}.json`);
  if (existsSync(dedicated)) {
    try {
      const profile = JSON.parse(readFileSync(dedicated, "utf8"));
      return {
        status: "partial",
        profileId: id,
        profile,
        source: dedicated,
        issues: [],
      };
    } catch (err) {
      issues.push(`parse-error:${dedicated}:${err?.message ?? err}`);
    }
  }

  const catalogPath = join(root, "biogeometric-profiles.json");
  if (existsSync(catalogPath)) {
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      const profiles = Array.isArray(catalog.profiles) ? catalog.profiles : [];
      const found =
        profiles.find((p) => p.id === id) ??
        profiles.find((p) => p.policyId === id) ??
        profiles.find((p) => p.domain === POLICY_TO_DOMAIN[id]);
      if (found) {
        return {
          status: "partial",
          profileId: id,
          profile: found,
          source: catalogPath,
          issues: [],
        };
      }
      issues.push(`not-in-catalog:${id}`);
    } catch (err) {
      issues.push(`catalog-parse-error:${err?.message ?? err}`);
    }
  } else {
    issues.push("biogeometric-catalog-missing");
  }

  return {
    status: "partial",
    profileId: id,
    profile: null,
    source: dedicated,
    issues,
  };
}

export function extractWorldProfileContext(intent, evidence) {
  const fromEvidence =
    evidence?.worldProfileAmendment ??
    evidence?.worldProfile ??
    evidence?.worldProfiles ??
    evidence?.amendmentVIII ??
    null;
  const fromIntent =
    intent?.params?.worldProfileAmendment ??
    intent?.worldProfileAmendment ??
    intent?.params?.worldProfile ??
    intent?.amendmentVIII ??
    null;
  const ctx = fromEvidence ?? fromIntent ?? null;
  const entities = Array.isArray(ctx?.entities)
    ? ctx.entities
    : Array.isArray(ctx?.fixtures)
      ? ctx.fixtures
      : Array.isArray(evidence?.worldEntities)
        ? evidence.worldEntities
        : [];
  const hasEntities = entities.length > 0;
  const enforce =
    intent?.params?.enforceWorldProfile === true ||
    intent?.enforceWorldProfile === true ||
    intent?.params?.enforceAmendmentVIII === true ||
    intent?.enforceAmendmentVIII === true ||
    evidence?.enforceWorldProfile === true ||
    evidence?.enforceAmendmentVIII === true ||
    ctx?.enforce === true ||
    intent?.type === "accept_world_profile" ||
    intent?.kind === "accept_world_profile" ||
    hasEntities;

  return { ctx, enforce, active: Boolean(ctx) || enforce, entities, hasEntities };
}

export function isWorldRenderLikeIntent(intent) {
  if (!intent) return false;
  return RENDER_KINDS.has(intent.type ?? intent.kind);
}

export function resolveEntityWorldPolicyId(entity, ctx) {
  const explicit =
    entity?.worldProfileId ??
    entity?.policyId ??
    entity?.worldProfile?.id ??
    null;
  if (explicit && WORLD_PROFILE_ORDER.includes(explicit)) return explicit;

  const objectType = String(
    entity?.objectType ??
      entity?.type ??
      entity?.["object.type"] ??
      entity?.worldDomain ??
      entity?.domain ??
      entity?.kind ??
      "",
  )
    .trim()
    .toLowerCase();

  const map = {
    biogeometric: WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC,
    terrain: WORLD_PROFILE_POLICY_IDS.TERRAIN,
    geological: WORLD_PROFILE_POLICY_IDS.TERRAIN,
    architecture: WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
    architectural: WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
    building: WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
    water: WORLD_PROFILE_POLICY_IDS.WATER,
    fluid: WORLD_PROFILE_POLICY_IDS.WATER,
    atmospheric: WORLD_PROFILE_POLICY_IDS.WATER,
    plant: WORLD_PROFILE_POLICY_IDS.PLANT,
    flora: WORLD_PROFILE_POLICY_IDS.PLANT,
    biological: WORLD_PROFILE_POLICY_IDS.PLANT,
    tree: WORLD_PROFILE_POLICY_IDS.PLANT,
    synthetic: WORLD_PROFILE_POLICY_IDS.SYNTHETIC,
    prop: WORLD_PROFILE_POLICY_IDS.SYNTHETIC,
    material: WORLD_PROFILE_POLICY_IDS.MATERIAL,
    scalecontext: WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
    "scale-context": WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
    variance: WORLD_PROFILE_POLICY_IDS.VARIANCE,
  };

  if (objectType && map[objectType]) return map[objectType];

  const fromCtx = ctx?.defaultWorldProfileId ?? ctx?.worldProfileId ?? null;
  if (fromCtx && WORLD_PROFILE_ORDER.includes(fromCtx)) return fromCtx;

  return null;
}

export function resolveWorldEntityScaleClass(entity, ctx) {
  return (
    entity?.scaleClass ??
    entity?.inheritedScaleClass ??
    entity?.parentScaleClass ??
    entity?.parentContext?.scaleClass ??
    entity?.worldContext?.worldScaleClass ??
    entity?.terrainContext?.worldScaleClass ??
    entity?.architecturalContext?.worldScaleClass ??
    entity?.architectureContext?.worldScaleClass ??
    entity?.materialContext?.worldScaleClass ??
    ctx?.worldScaleClass ??
    ctx?.parentScaleClass ??
    null
  );
}

/**
 * @param {string} policyId
 * @param {object} entity
 * @param {object|null|undefined} ctx
 */
export function validateWorldEntity(policyId, entity, ctx) {
  const issues = [];
  const entityPolicy = resolveEntityWorldPolicyId(entity, ctx);
  const isCrossCut = CROSS_CUT.has(policyId);

  // Domain policies only apply to matching entities.
  if (!isCrossCut) {
    if (!entityPolicy) {
      return { ok: true, skipped: true, reason: "no-objectType", issues: [] };
    }
    if (entityPolicy !== policyId) {
      return {
        ok: true,
        skipped: true,
        reason: "domain-mismatch",
        issues: [],
      };
    }
  }

  // --- world.biogeometric umbrella ---
  if (policyId === WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC) {
    if (!entityPolicy && !entity?.objectType && !entity?.type && !entity?.worldProfileId) {
      issues.push("missing-objectType-or-worldProfileId");
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
        issues,
        profileId: null,
        scaleClass: null,
      };
    }
  }

  // --- world.scaleContext (cross-cut) ---
  if (policyId === WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT) {
    const scaleLoaded = loadWorldProfile(WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT);
    const scaleClass = resolveWorldEntityScaleClass(entity, {
      ...ctx,
      worldScaleClass:
        ctx?.worldScaleClass ??
        scaleLoaded.profile?.worldScaleClass ??
        null,
    });
    if (!scaleClass || !String(scaleClass).trim()) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.MISSING_SCALE,
        issues: ["missing-scale-context"],
        profileId: WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
        scaleClass: null,
      };
    }
    if (!scaleLoaded.profile) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
        issues: [...scaleLoaded.issues, "world.scaleContext-not-loaded"],
        profileId: WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
        scaleClass,
      };
    }
    return {
      ok: true,
      skipped: false,
      haltCode: null,
      issues: [],
      profileId: WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
      scaleClass,
    };
  }

  // --- world.variance (cross-cut) ---
  if (policyId === WORLD_PROFILE_POLICY_IDS.VARIANCE) {
    const varLoaded = loadWorldProfile(WORLD_PROFILE_POLICY_IDS.VARIANCE);
    const minVar =
      typeof entity?.minEnvironmentalVariance === "number"
        ? entity.minEnvironmentalVariance
        : typeof varLoaded.profile?.minEnvironmentalVariance === "number"
          ? varLoaded.profile.minEnvironmentalVariance
          : 0.001;
    const measured =
      typeof entity?.environmentalVarianceMeasured === "number"
        ? entity.environmentalVarianceMeasured
        : typeof entity?.organicVarianceMeasured === "number"
          ? entity.organicVarianceMeasured
          : typeof entity?.metrics?.organicVariance === "number"
            ? entity.metrics.organicVariance
            : undefined;

    if (entity?.symmetryAveraged === true || entity?.lrAveraged === true) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.ENVIRONMENTAL_VARIANCE,
        issues: ["lr-vertices-averaged"],
        profileId: WORLD_PROFILE_POLICY_IDS.VARIANCE,
        scaleClass: resolveWorldEntityScaleClass(entity, ctx),
      };
    }

    if (typeof measured !== "number" || !Number.isFinite(measured)) {
      // Soft path may omit measurement; only HALT when required or enforceVariance
      if (
        entity?.requireVarianceMeasurement === true ||
        ctx?.requireVariance === true
      ) {
        return {
          ok: false,
          skipped: false,
          haltCode: WORLD_PROFILE_HALT_CODES.ENVIRONMENTAL_VARIANCE,
          issues: ["missing-environmentalVariance-measurement"],
          profileId: WORLD_PROFILE_POLICY_IDS.VARIANCE,
          scaleClass: resolveWorldEntityScaleClass(entity, ctx),
        };
      }
      return {
        ok: true,
        skipped: true,
        reason: "no-variance-measurement",
        issues: [],
      };
    }

    if (measured < minVar) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.ENVIRONMENTAL_VARIANCE,
        issues: [`environmentalVariance=${measured} < min=${minVar}`],
        profileId: WORLD_PROFILE_POLICY_IDS.VARIANCE,
        scaleClass: resolveWorldEntityScaleClass(entity, ctx),
        measured,
        minVar,
      };
    }
    return {
      ok: true,
      skipped: false,
      haltCode: null,
      issues: [],
      profileId: WORLD_PROFILE_POLICY_IDS.VARIANCE,
      scaleClass: resolveWorldEntityScaleClass(entity, ctx),
      measured,
      minVar,
    };
  }

  // --- world.material (cross-cut when material context present) ---
  if (policyId === WORLD_PROFILE_POLICY_IDS.MATERIAL) {
    const hasMaterial =
      entity?.materialContext != null ||
      entity?.materialId != null ||
      entity?.material != null ||
      entity?.requireMaterialContext === true;
    if (!hasMaterial) {
      return {
        ok: true,
        skipped: true,
        reason: "no-material-context",
        issues: [],
      };
    }
    const matLoaded = loadWorldProfile(WORLD_PROFILE_POLICY_IDS.MATERIAL);
    if (!matLoaded.profile) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.MISSING_MATERIAL_CONTEXT,
        issues: [...matLoaded.issues, "world.material-not-loaded"],
        profileId: WORLD_PROFILE_POLICY_IDS.MATERIAL,
        scaleClass: resolveWorldEntityScaleClass(entity, ctx),
      };
    }
    const matId =
      entity?.materialContext?.materialId ??
      entity?.materialId ??
      entity?.material?.id ??
      null;
    if (entity?.requireMaterialContext === true && !matId) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.MISSING_MATERIAL_CONTEXT,
        issues: ["missing-materialId"],
        profileId: WORLD_PROFILE_POLICY_IDS.MATERIAL,
        scaleClass: resolveWorldEntityScaleClass(entity, ctx),
      };
    }
    return {
      ok: true,
      skipped: false,
      haltCode: null,
      issues: [],
      profileId: WORLD_PROFILE_POLICY_IDS.MATERIAL,
      scaleClass: resolveWorldEntityScaleClass(entity, ctx),
    };
  }

  // --- Domain policies (terrain, architecture, water, plant, synthetic) + biogeometric load ---
  const profileId =
    policyId === WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC
      ? entity?.worldProfileId ??
        entityPolicy ??
        WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC
      : entity?.worldProfileId ?? entityPolicy ?? policyId;

  if (!profileId) {
    issues.push("missing-world-profile-id");
    return {
      ok: false,
      skipped: false,
      haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
      issues,
      profileId: null,
      scaleClass: null,
    };
  }

  const loaded = loadWorldProfile(
    policyId === WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC &&
      entityPolicy &&
      entityPolicy !== WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC
      ? entityPolicy
      : profileId,
  );
  if (!loaded.profile && policyId !== WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC) {
    issues.push(...loaded.issues);
    issues.push(`world-profile-not-loaded:${profileId}`);
    return {
      ok: false,
      skipped: false,
      haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
      issues,
      profileId,
      scaleClass: null,
    };
  }

  // Biogeometric umbrella: if entity has typed profile, ensure it loads; else load umbrella.
  if (policyId === WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC) {
    const typedId = entityPolicy ?? profileId;
    const typed = loadWorldProfile(typedId);
    if (!typed.profile && typedId !== WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC) {
      const umbrella = loadWorldProfile(WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC);
      if (!umbrella.profile) {
        return {
          ok: false,
          skipped: false,
          haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
          issues: [...typed.issues, ...umbrella.issues],
          profileId: typedId,
          scaleClass: null,
        };
      }
    }
  }

  const scaleClass = resolveWorldEntityScaleClass(entity, {
    ...ctx,
    worldScaleClass:
      ctx?.worldScaleClass ?? loaded.profile?.worldScaleClass ?? null,
  });

  if (
    policyId !== WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC &&
    (!scaleClass || !String(scaleClass).trim())
  ) {
    issues.push("missing-scale-context");
    return {
      ok: false,
      skipped: false,
      haltCode: WORLD_PROFILE_HALT_CODES.MISSING_SCALE,
      issues,
      profileId,
      scaleClass: null,
    };
  }

  const ranges = entity?.ranges ?? loaded.profile?.ranges ?? null;
  const metrics = entity?.metrics ?? {};
  if (ranges && typeof ranges === "object" && Object.keys(metrics).length > 0) {
    for (const [key, range] of Object.entries(ranges)) {
      const value = metrics[key];
      if (value === undefined || value === null || !range) continue;
      if (
        typeof value === "number" &&
        typeof range.min === "number" &&
        typeof range.max === "number" &&
        (value < range.min || value > range.max)
      ) {
        issues.push(`${key}=${value} outside [${range.min},${range.max}]`);
      }
    }
    if (issues.length) {
      return {
        ok: false,
        skipped: false,
        haltCode: WORLD_PROFILE_HALT_CODES.WORLD_PROFILE_NONCONFORMANCE,
        issues,
        profileId,
        scaleClass,
      };
    }
  }

  return {
    ok: true,
    skipped: false,
    haltCode: null,
    issues: [],
    profileId,
    scaleClass,
  };
}

function buildAuditReceipt({ policyId, haltCode, entityId, issues, intentId }) {
  return {
    schema: "ckl.amendment-viii.audit-receipt.v1",
    amendment: AMENDMENT_VIII_ID,
    policyId,
    haltCode,
    entityId: entityId ?? null,
    intentId: intentId ?? null,
    issues: Array.isArray(issues) ? issues.slice() : [],
    at: new Date().toISOString(),
    status: "partial",
  };
}

function denyResult(policyId, haltCode, entity, issues, intent, extra = {}) {
  return {
    applies: true,
    ok: false,
    policyId,
    haltCode,
    haltOn: [`deny.${policyId}`],
    reason: `ckl-${policyId}-deny`,
    auditReceipt: buildAuditReceipt({
      policyId,
      haltCode,
      entityId: entity?.id,
      issues,
      intentId: intent?.id,
    }),
    issues,
    ...extra,
  };
}

export function evaluateWorldProfilePolicy(policyId, intent, evidence) {
  if (!WORLD_PROFILE_ORDER.includes(policyId)) {
    return { applies: false, ok: true };
  }

  const { ctx, enforce, active, entities, hasEntities } =
    extractWorldProfileContext(intent, evidence);

  if (!active && !enforce) {
    return { applies: false, ok: true };
  }

  if (
    !isWorldRenderLikeIntent(intent) &&
    !enforce &&
    intent?.type !== "accept_world_profile"
  ) {
    return { applies: false, ok: true };
  }

  if (enforce && !hasEntities) {
    if (policyId === WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC) {
      return denyResult(
        WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC,
        WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
        null,
        ["enforceWorldProfile-but-no-entities"],
        intent,
      );
    }
    return { applies: true, ok: true, skipped: true };
  }

  for (const entity of entities) {
    const result = validateWorldEntity(policyId, entity, ctx);
    if (result.skipped) continue;
    if (!result.ok) {
      return denyResult(
        policyId,
        result.haltCode,
        entity,
        result.issues,
        intent,
        {
          profileId: result.profileId,
          scaleClass: result.scaleClass,
        },
      );
    }
  }

  return { applies: true, ok: true, policyId };
}

export function evaluateWorldProfileOrdered(intent, evidence) {
  for (const policyId of WORLD_PROFILE_ORDER) {
    const result = evaluateWorldProfilePolicy(policyId, intent, evidence);
    if (result.applies && !result.ok) return result;
  }
  const { active, enforce } = extractWorldProfileContext(intent, evidence);
  return { applies: active || enforce, ok: true };
}

export function evaluateAmendmentVIIIOrdered(intent, evidence) {
  return evaluateWorldProfileOrdered(intent, evidence);
}

/**
 * CIS SCAL / ENRG-SCALE verify — wired to world.scaleContext when possible.
 * Status: **partial** when scaleClass present and world.scaleContext loads;
 * Genblaze SX opcode bind still **declared** / not shipped.
 *
 * @param {object} step
 */
export function verifyScalStep(step = {}) {
  const opcode = String(step.opcode ?? step.op ?? "").toUpperCase();
  const phase = String(step.phase ?? step.substep ?? "").toUpperCase();
  const isScal =
    opcode === "SCAL" ||
    phase === "SCAL" ||
    phase === "ENRG-SCALE" ||
    opcode === "ENRG-SCALE";

  if (!isScal) {
    return {
      ok: false,
      status: "declared",
      reason: "not-a-scal-step",
      haltCode: null,
    };
  }

  const scaleLoaded = loadWorldProfile(WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT);
  const scaleClass =
    step.scaleClass ??
    step.context?.scaleClass ??
    step.worldScaleClass ??
    step.context?.worldScaleClass ??
    scaleLoaded.profile?.worldScaleClass ??
    null;

  if (!scaleClass) {
    return {
      ok: false,
      status: "partial",
      reason: "SCAL-missing-scaleClass",
      haltCode: WORLD_PROFILE_HALT_CODES.MISSING_SCALE,
      worldScaleContextLoaded: Boolean(scaleLoaded.profile),
      note: "Amendment VIII world.scaleContext required for SCAL verify",
    };
  }

  if (!scaleLoaded.profile) {
    return {
      ok: false,
      status: "partial",
      reason: "world.scaleContext-catalog-missing",
      haltCode: WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
      scaleClass,
      issues: scaleLoaded.issues,
    };
  }

  return {
    ok: true,
    status: "partial",
    reason: "SCAL-scaleClass-present-via-world.scaleContext",
    scaleClass,
    worldProfileId: WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
    haltCode: null,
    note: "CKL world.scaleContext wired for SCAL verify; Genblaze SX opcode bind not shipped",
  };
}
