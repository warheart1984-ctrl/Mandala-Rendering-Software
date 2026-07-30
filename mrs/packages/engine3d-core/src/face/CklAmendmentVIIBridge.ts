/**
 * Bridge: Engine3D soft-apply ↔ CKL Amendment VII + World-Profile (single SoT).
 *
 * Loads `engine/governance/biometric/amendmentVII.js` / `worldProfile.js` and
 * policy IDs from `default.policies.json`. Soft-gate Apply must not re-implement
 * deny rules — it asks CKL and applies corrections; HALT only when CKL denies.
 *
 * Status: **partial** (dynamic load of CKL module; world-profile path partial).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CKL_AMENDMENT_VII_POLICY_IDS = [
  "policy-biometric-conformance",
  "policy-adaptive-scale",
  "policy-organic-variance",
] as const;

export const CKL_WORLD_PROFILE_POLICY_IDS = [
  "world.biogeometric",
  "world.scaleContext",
  "world.architecture",
  "world.terrain",
  "world.water",
  "world.plant",
  "world.synthetic",
  "world.material",
  "world.variance",
] as const;

/** Apply remaining kinds after scaleContext + biogeometric (user patch §4). */
export const CKL_WORLD_PROFILE_APPLY_REMAINING = [
  "world.architecture",
  "world.terrain",
  "world.water",
  "world.plant",
  "world.synthetic",
  "world.material",
  "world.variance",
] as const;

export type CklAmendmentVIIPolicyId =
  (typeof CKL_AMENDMENT_VII_POLICY_IDS)[number];

export type CklWorldProfilePolicyId =
  (typeof CKL_WORLD_PROFILE_POLICY_IDS)[number];

export interface CklAmendmentVIIModule {
  readonly POLICY_IDS: {
    readonly BIOMETRIC: string;
    readonly ADAPTIVE_SCALE: string;
    readonly ORGANIC_VARIANCE: string;
  };
  readonly HALT_CODES: {
    readonly BIOMETRIC: string;
    readonly MISSING_SCALE: string;
    readonly ORGANIC_VARIANCE: string;
    readonly MISSING_WORLD_CONTEXT?: string;
    readonly WORLD_PROFILE_NONCONFORMANCE?: string;
    readonly ENVIRONMENTAL_VARIANCE?: string;
  };
  readonly AMENDMENT_VII_ORDER: readonly string[];
  readonly WORLD_PROFILE_POLICY_IDS: {
    readonly BIOGEOMETRIC: string;
    readonly TERRAIN: string;
    readonly ARCHITECTURE: string;
    readonly WATER: string;
    readonly PLANT: string;
    readonly SYNTHETIC: string;
    readonly MATERIAL: string;
    readonly SCALE_CONTEXT: string;
    readonly VARIANCE: string;
  };
  readonly WORLD_PROFILE_ORDER: readonly string[];
  readonly WORLD_PROFILE_HALT_CODES: {
    readonly MISSING_WORLD_CONTEXT: string;
    readonly WORLD_PROFILE_NONCONFORMANCE: string;
    readonly ENVIRONMENTAL_VARIANCE: string;
    readonly MISSING_SCALE: string;
    readonly MISSING_MATERIAL_CONTEXT?: string;
  };
  evaluateAmendmentVIIPolicy: (
    policyId: string,
    intent: object | null | undefined,
    evidence: object | null | undefined,
  ) => CklGateResult;
  evaluateAmendmentVIIOrdered: (
    intent: object | null | undefined,
    evidence: object | null | undefined,
  ) => CklGateResult;
  evaluateWorldProfilePolicy: (
    policyId: string,
    intent: object | null | undefined,
    evidence: object | null | undefined,
  ) => CklGateResult;
  evaluateWorldProfileOrdered: (
    intent: object | null | undefined,
    evidence: object | null | undefined,
  ) => CklGateResult;
  loadWorldProfile: (profileId: string) => WorldProfileLoadResult;
}

export interface WorldProfileLoadResult {
  readonly status: "partial";
  readonly profileId: string;
  readonly profile: Record<string, unknown> | null;
  readonly source: string;
  readonly issues: readonly string[];
}

export interface CklGateResult {
  readonly applies: boolean;
  readonly ok: boolean;
  readonly policyId?: string;
  readonly haltCode?: string | null;
  readonly issues?: readonly string[];
  readonly skipped?: boolean;
  readonly auditReceipt?: unknown;
}

export interface CklPolicyManifest {
  readonly status: "partial";
  readonly source: string;
  readonly policyIds: readonly CklAmendmentVIIPolicyId[];
  readonly worldProfileIds: readonly CklWorldProfilePolicyId[];
  readonly order: readonly string[];
  readonly worldProfileOrder: readonly string[];
}

function resolveRepoCandidates(relativeParts: string[]): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/face and dist/src/face both walk up to repo root.
  const roots = [
    join(here, "..", "..", "..", "..", ".."), // src/face → repo
    join(here, "..", "..", "..", "..", "..", ".."), // dist/src/face → repo
  ];
  return roots.map((root) => join(root, ...relativeParts));
}

export function resolveCklAmendmentVIIModulePath(): string {
  const candidates = resolveRepoCandidates([
    "engine",
    "governance",
    "biometric",
    "amendmentVII.js",
  ]);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function resolveDefaultPoliciesPath(): string {
  const candidates = resolveRepoCandidates([
    "engine",
    "governance",
    "policies",
    "default.policies.json",
  ]);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

/**
 * Read Amendment VII + world-profile policy IDs / order from default.policies.json
 * and amendmentVII.order.json (short aliases).
 */
export function loadAmendmentVIIPolicyManifest(): CklPolicyManifest {
  const source = resolveDefaultPoliciesPath();
  if (!existsSync(source)) {
    return {
      status: "partial",
      source,
      policyIds: [...CKL_AMENDMENT_VII_POLICY_IDS],
      worldProfileIds: [...CKL_WORLD_PROFILE_POLICY_IDS],
      order: [...CKL_AMENDMENT_VII_POLICY_IDS],
      worldProfileOrder: [...CKL_WORLD_PROFILE_POLICY_IDS],
    };
  }
  const policies = JSON.parse(readFileSync(source, "utf8")) as Array<{
    id?: string;
    amendment?: string;
    order?: number;
    kind?: string;
  }>;
  const withId = policies.filter((p) => typeof p.id === "string");
  const human = withId
    .filter((p) => CKL_AMENDMENT_VII_POLICY_IDS.includes(p.id as CklAmendmentVIIPolicyId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const world = withId
    .filter((p) =>
      CKL_WORLD_PROFILE_POLICY_IDS.includes(p.id as CklWorldProfilePolicyId),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ids = human
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string");
  const worldIds = world
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string");
  const known = CKL_AMENDMENT_VII_POLICY_IDS.filter((id) => ids.includes(id));
  const knownWorld = CKL_WORLD_PROFILE_POLICY_IDS.filter((id) =>
    worldIds.includes(id),
  );
  return {
    status: "partial",
    source,
    policyIds: known.length === 3 ? known : [...CKL_AMENDMENT_VII_POLICY_IDS],
    worldProfileIds:
      knownWorld.length === 9 ? knownWorld : [...CKL_WORLD_PROFILE_POLICY_IDS],
    order: ids.length ? ids : [...CKL_AMENDMENT_VII_POLICY_IDS],
    worldProfileOrder: worldIds.length
      ? worldIds
      : [...CKL_WORLD_PROFILE_POLICY_IDS],
  };
}

export function loadPolicyOrder(
  amendment = "amendmentVII",
): readonly string[] {
  const candidates = resolveRepoCandidates([
    "engine",
    "governance",
    "policies",
    `${amendment}.order.json`,
  ]);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      amendmentVII?: { order?: string[] };
      order?: string[];
    };
    const order = raw.amendmentVII?.order ?? raw.order;
    if (Array.isArray(order) && order.length) return order;
  }
  return [
    "biometric",
    "adaptiveScale",
    "organicVariance",
    ...CKL_WORLD_PROFILE_POLICY_IDS,
  ];
}

export interface RegisteredAmendmentVII {
  readonly status: "partial";
  readonly amendmentId: string;
  readonly order: readonly string[];
  readonly enabledPolicies: readonly string[];
  readonly policies: Record<string, unknown>;
}

/**
 * Register amendment + enablePolicy for all world.* IDs (user patch §3).
 * Adapts to existing CKL/module APIs — no separate CKL class required.
 */
export function registerAmendmentVIIBridge(): RegisteredAmendmentVII {
  const ckl = getCklAmendmentVII() as CklAmendmentVIIModule & {
    amendmentVII?: { id: string; order: string[]; policies: Record<string, unknown> };
    ENABLED_WORLD_PROFILE_POLICIES?: readonly string[];
  };
  const order = loadPolicyOrder("amendmentVII");
  const reg =
    (ckl as unknown as { amendmentVII?: RegisteredAmendmentVII["policies"] & { order?: string[]; id?: string; policies?: Record<string, unknown> } }).amendmentVII ??
    null;
  const enabled = [
    ...CKL_AMENDMENT_VII_POLICY_IDS,
    ...CKL_WORLD_PROFILE_POLICY_IDS,
  ];
  // Explicit world-profile awareness (enablePolicy equivalents)
  for (const id of CKL_WORLD_PROFILE_POLICY_IDS) {
    loadWorldProfile(id);
  }
  return {
    status: "partial",
    amendmentId: "amendmentVII",
    order: reg && Array.isArray((reg as { order?: string[] }).order)
      ? ((reg as { order: string[] }).order)
      : order,
    enabledPolicies: enabled,
    policies: (reg as { policies?: Record<string, unknown> })?.policies ?? {},
  };
}

/** enablePolicy — marks a world.* / human policy as loaded and available. */
export function enablePolicy(policyId: string): {
  ok: boolean;
  policyId: string;
  profileLoaded: boolean;
} {
  const isWorld = CKL_WORLD_PROFILE_POLICY_IDS.includes(
    policyId as CklWorldProfilePolicyId,
  );
  if (isWorld) {
    const loaded = loadWorldProfile(policyId);
    return {
      ok: Boolean(loaded.profile),
      policyId,
      profileLoaded: Boolean(loaded.profile),
    };
  }
  const knownHuman = CKL_AMENDMENT_VII_POLICY_IDS.includes(
    policyId as CklAmendmentVIIPolicyId,
  );
  return { ok: knownHuman, policyId, profileLoaded: false };
}

/**
 * User-shaped bridge entry: register amendment + enable all world.* policies.
 */
export function CklAmendmentVIIBridge(): RegisteredAmendmentVII {
  const registered = registerAmendmentVIIBridge();
  for (const id of CKL_WORLD_PROFILE_POLICY_IDS) {
    enablePolicy(id);
  }
  return registered;
}

let cachedModule: CklAmendmentVIIModule | null = null;
const requireFromHere = createRequire(import.meta.url);

export function getCklAmendmentVII(): CklAmendmentVIIModule {
  if (cachedModule) return cachedModule;
  const path = resolveCklAmendmentVIIModulePath();
  if (!existsSync(path)) {
    throw new Error(`CKL Amendment VII module missing: ${path}`);
  }
  cachedModule = requireFromHere(path) as CklAmendmentVIIModule;
  return cachedModule;
}

/**
 * Load world-profile law for a domain / policy id via CKL SoT.
 * Status: **partial**
 */
export function loadWorldProfile(
  profileId: CklWorldProfilePolicyId | string,
): WorldProfileLoadResult {
  const ckl = getCklAmendmentVII();
  return ckl.loadWorldProfile(profileId);
}

export interface RenderFixtureForCkl {
  id: string;
  scaleClass: string | null;
  biometricProfileId?: string;
  profile?: object;
  metrics?: Record<string, number>;
  organicVarianceMeasured?: number;
  minOrganicVariance?: number;
  symmetryAveraged?: boolean;
  lrAveraged?: boolean;
}

export interface WorldEntityForCkl {
  id: string;
  objectType?: string;
  worldProfileId?: string | null;
  scaleClass?: string | null;
  parentScaleClass?: string | null;
  worldContext?: {
    worldId?: string;
    worldProfileId?: string;
    worldScaleClass?: string;
    biomeTag?: string;
  };
  parentContext?: {
    objectId?: string;
    scaleClass?: string;
    objectType?: string;
  };
  terrainContext?: {
    worldScaleClass?: string;
    profileId?: string;
  };
  architecturalContext?: {
    worldScaleClass?: string;
    profileId?: string;
  };
  /** Alias preferred in Amendment VIII docs */
  architectureContext?: {
    worldScaleClass?: string;
    profileId?: string;
  };
  materialContext?: {
    materialId?: string;
    worldScaleClass?: string;
    profileId?: string;
  };
  metrics?: Record<string, number>;
  environmentalVarianceMeasured?: number;
  organicVarianceMeasured?: number;
  minEnvironmentalVariance?: number;
  symmetryAveraged?: boolean;
  lrAveraged?: boolean;
  requireVarianceMeasurement?: boolean;
  requireMaterialContext?: boolean;
}

export function buildCklRenderIntent(intentId = "intent-engine3d-amendment-vii") {
  return {
    id: intentId,
    type: "render_fixture",
    kind: "render_fixture",
    actor: "4dce.renderer",
    action: "render.session.start",
    enforceAmendmentVII: true,
  };
}

export function buildCklWorldRenderIntent(
  intentId = "intent-engine3d-world-profile",
) {
  return {
    id: intentId,
    type: "render.world",
    kind: "render.world",
    actor: "4dce.renderer",
    action: "render.session.start",
    enforceWorldProfile: true,
  };
}

export function buildCklBiometricEvidence(
  fixtures: readonly RenderFixtureForCkl[],
  worldScaleClass?: string | null,
) {
  return {
    id: "ev-engine3d-amendment-vii",
    worldId: "world-engine3d-soft",
    timelineId: "tl-engine3d-soft",
    enforceAmendmentVII: true,
    biometricAmendment: {
      enforce: true,
      worldScaleClass: worldScaleClass ?? undefined,
      fixtures: fixtures.map((f) => ({ ...f })),
    },
  };
}

export function buildCklWorldProfileEvidence(
  entities: readonly WorldEntityForCkl[],
  options?: {
    worldScaleClass?: string | null;
    worldProfileId?: string | null;
  },
) {
  return {
    id: "ev-engine3d-world-profile",
    worldId: "world-engine3d-soft",
    timelineId: "tl-engine3d-world",
    enforceWorldProfile: true,
    worldProfileAmendment: {
      enforce: true,
      worldScaleClass: options?.worldScaleClass ?? undefined,
      worldProfileId: options?.worldProfileId ?? undefined,
      entities: entities.map((e) => ({ ...e })),
    },
  };
}

/**
 * Evaluate one Amendment VII policy via CKL (not a parallel local deny tree).
 */
export function evaluateCklAmendmentVIIGate(
  policyId: CklAmendmentVIIPolicyId | string,
  fixtures: readonly RenderFixtureForCkl[],
  options?: { worldScaleClass?: string | null; intentId?: string },
): CklGateResult {
  const ckl = getCklAmendmentVII();
  const intent = buildCklRenderIntent(options?.intentId);
  const evidence = buildCklBiometricEvidence(
    fixtures,
    options?.worldScaleClass,
  );
  return ckl.evaluateAmendmentVIIPolicy(policyId, intent, evidence);
}

/**
 * Ordered CKL evaluation (biometric → adaptive-scale → organic-variance).
 */
export function evaluateCklAmendmentVIIOrdered(
  fixtures: readonly RenderFixtureForCkl[],
  options?: { worldScaleClass?: string | null; intentId?: string },
): CklGateResult {
  const ckl = getCklAmendmentVII();
  const intent = buildCklRenderIntent(options?.intentId);
  const evidence = buildCklBiometricEvidence(
    fixtures,
    options?.worldScaleClass,
  );
  return ckl.evaluateAmendmentVIIOrdered(intent, evidence);
}

/**
 * Evaluate one world-profile policy via CKL.
 */
export function evaluateCklWorldProfileGate(
  policyId: CklWorldProfilePolicyId | string,
  entities: readonly WorldEntityForCkl[],
  options?: {
    worldScaleClass?: string | null;
    worldProfileId?: string | null;
    intentId?: string;
  },
): CklGateResult {
  const ckl = getCklAmendmentVII();
  const intent = buildCklWorldRenderIntent(options?.intentId);
  const evidence = buildCklWorldProfileEvidence(entities, options);
  return ckl.evaluateWorldProfilePolicy(policyId, intent, evidence);
}

/**
 * Ordered world-profile CKL evaluation (six world.* policies).
 */
export function evaluateCklWorldProfileOrdered(
  entities: readonly WorldEntityForCkl[],
  options?: {
    worldScaleClass?: string | null;
    worldProfileId?: string | null;
    intentId?: string;
  },
): CklGateResult {
  const ckl = getCklAmendmentVII();
  const intent = buildCklWorldRenderIntent(options?.intentId);
  const evidence = buildCklWorldProfileEvidence(entities, options);
  return ckl.evaluateWorldProfileOrdered(intent, evidence);
}
