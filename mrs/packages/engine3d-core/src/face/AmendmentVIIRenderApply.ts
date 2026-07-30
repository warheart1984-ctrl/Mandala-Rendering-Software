/**
 * Amendment VII — apply the three CKL gates on the Engine3D soft-raster path,
 * plus world-profile → CKL (terrain/plant/water/architecture/synthetic).
 *
 * Soft-gate decisions come from CKL (`engine/governance/biometric/amendmentVII.js`
 * + `worldProfile.js` + `default.policies.json`) — not a parallel ad-hoc deny tree.
 *
 * Soft mode (cinematic): apply corrections where designed; HALT only when CKL
 * would deny (after soft corrections for biometric/organic/world-profile).
 *
 * Status: **partial**
 */

import type { Mat4Tuple } from "../human/HumanRigTypes.js";
import type { RasterMesh } from "../renderer/raster/HeadlessStillRenderer.js";
import {
  positionOrganicVariance,
  EI_ORGANIC_VARIANCE,
} from "../renderer/raster/OrganicVariance.js";
import {
  getBiometricProfile,
  loadBiometricCatalog,
  metricsFromAabb,
  type BiometricProfile,
  type ScaleClass,
} from "./BiometricProfile.js";
import { computeMeshAabb } from "./FixtureFaceRegistry.js";
import {
  inheritMetricsFromContext,
  type MetricContext,
} from "./MetricInheritance.js";
import {
  inheritEcologicalScale,
  HALT_MISSING_WORLD_CONTEXT,
} from "./EcologicalInheritance.js";
import {
  CKL_AMENDMENT_VII_POLICY_IDS,
  CKL_WORLD_PROFILE_POLICY_IDS,
  CKL_WORLD_PROFILE_APPLY_REMAINING,
  evaluateCklAmendmentVIIGate,
  evaluateCklWorldProfileGate,
  getCklAmendmentVII,
  loadAmendmentVIIPolicyManifest,
  loadWorldProfile,
  type RenderFixtureForCkl,
  type WorldEntityForCkl,
} from "./CklAmendmentVIIBridge.js";
import {
  renderContextToWorldEntity,
  type RenderContext,
} from "./Engine3DContext.js";

export type AmendmentVIIApplyMode = "soft" | "strict";

export interface AmendmentVIIApplyRequest {
  readonly meshes: readonly RasterMesh[];
  /** Required scale context — no silent human-sized default when gated. */
  readonly scaleClassOrProfileId: string;
  readonly mode?: AmendmentVIIApplyMode;
  /** When true (or mode===strict), clear nonconformance throws / returns halt. */
  readonly strictHalt?: boolean;
  /** Seed for deterministic organic asymmetry (default 0xA7E07). */
  readonly organicSeed?: number;
  /** Max relative position nudge as fraction of AABB extent (default 0.028). */
  readonly organicStrength?: number;
  /**
   * When false, compute lawful scale but do not bake into modelMatrix
   * (cinematic character builder applies `uniformScale` as character scale).
   * Default true.
   */
  readonly bakeScale?: boolean;
  /**
   * World-profile entities for CKL world.* gates (partial).
   * When `requireWorldContext` and entities present / missing context → HALT.
   */
  readonly worldEntities?: readonly WorldEntityForCkl[];
  readonly worldProfileId?: string | null;
  readonly requireWorldContext?: boolean;
  /** Optional Engine3D RenderContext (object + world) — wired into worldEntities. */
  readonly renderContext?: RenderContext;
}

export interface AmendmentVIIApplyResult {
  readonly ok: boolean;
  readonly status: "partial";
  readonly mode: AmendmentVIIApplyMode;
  readonly meshes: RasterMesh[];
  readonly scaleClass: ScaleClass | string;
  readonly uniformScale: number;
  readonly targetHeadHeightMeters: number | null;
  readonly measuredAabbHeight: number | null;
  readonly organicVarianceBefore: number | null;
  readonly organicVarianceAfter: number | null;
  readonly asymmetryApplied: boolean;
  readonly biometricOk: boolean;
  readonly scaleOk: boolean;
  readonly organicOk: boolean;
  readonly worldProfileOk: boolean;
  readonly haltCode: string | null;
  readonly issues: readonly string[];
  readonly notes: readonly string[];
  readonly gates: {
    readonly biometric: "applied" | "halt" | "skipped";
    readonly adaptiveScale: "applied" | "halt" | "skipped";
    readonly organicVariance: "applied" | "halt" | "skipped";
    readonly worldProfile: "applied" | "halt" | "skipped";
  };
  /** Evidence that gates were asked of CKL, not a local copy. */
  readonly ckl: {
    readonly source: "engine/governance/biometric/amendmentVII.js";
    readonly policies: readonly string[];
    readonly worldProfilePolicies: readonly string[];
    readonly policyManifestSource: string;
  };
}

function mulScaleMat4(m: Mat4Tuple, s: number): Mat4Tuple {
  return [
    m[0]! * s,
    m[1]! * s,
    m[2]! * s,
    m[3]!,
    m[4]! * s,
    m[5]! * s,
    m[6]! * s,
    m[7]!,
    m[8]! * s,
    m[9]! * s,
    m[10]! * s,
    m[11]!,
    m[12]!,
    m[13]!,
    m[14]!,
    m[15]!,
  ];
}

function hashU32(n: number): number {
  let x = (n >>> 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Deterministic micro-asymmetry: nudge +X side verts slightly differently
 * than −X so perfect mirror fixtures stop reading as mathematical dolls.
 * Does not average L/R; preserves topology.
 */
export function applyControlledOrganicAsymmetry(
  positions: Float32Array,
  options?: { seed?: number; strength?: number; extent?: number },
): { positions: Float32Array; varianceBefore: number; varianceAfter: number } {
  const varianceBefore = positionOrganicVariance(positions);
  const out = new Float32Array(positions);
  const n = Math.floor(out.length / 3);
  if (n < 4) {
    return { positions: out, varianceBefore, varianceAfter: varianceBefore };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = out[i * 3]!;
    const y = out[i * 3 + 1]!;
    const z = out[i * 3 + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const extent =
    options?.extent && options.extent > 0
      ? options.extent
      : Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const strength = (options?.strength ?? 0.028) * extent;
  const seed = options?.seed ?? 0xa7e07;
  const cx = (minX + maxX) * 0.5;
  for (let i = 0; i < n; i++) {
    const x = out[i * 3]!;
    const h = hashU32(seed + i * 2654435761);
    const side = x >= cx ? 1 : -1;
    // Asymmetric: +X gets slightly larger Y/Z jitter amplitude than −X
    const amp = side > 0 ? strength : strength * 0.55;
    const dx = (((h & 0xff) / 255) * 2 - 1) * amp * 0.35 * side;
    const dy = ((((h >>> 8) & 0xff) / 255) * 2 - 1) * amp;
    const dz = ((((h >>> 16) & 0xff) / 255) * 2 - 1) * amp * 0.7;
    out[i * 3] = x + dx;
    out[i * 3 + 1] = out[i * 3 + 1]! + dy;
    out[i * 3 + 2] = out[i * 3 + 2]! + dz;
  }
  return {
    positions: out,
    varianceBefore,
    varianceAfter: positionOrganicVariance(out),
  };
}

function midRange(min: number, max: number): number {
  return (min + max) * 0.5;
}

function isFaceLikeMesh(m: RasterMesh): boolean {
  return /face|head|skin|human/i.test(m.id);
}

function headFracSafe(profile: BiometricProfile): number {
  return midRange(
    profile.limbRatios.headToHeight.min,
    profile.limbRatios.headToHeight.max,
  );
}

function cklMeta() {
  const manifest = loadAmendmentVIIPolicyManifest();
  return {
    source: "engine/governance/biometric/amendmentVII.js" as const,
    policies: [
      ...(manifest.order.length
        ? manifest.order
        : CKL_AMENDMENT_VII_POLICY_IDS),
    ],
    worldProfilePolicies: [
      ...(manifest.worldProfileOrder.length
        ? manifest.worldProfileOrder
        : CKL_WORLD_PROFILE_POLICY_IDS),
    ],
    policyManifestSource: manifest.source,
  };
}

function haltResult(
  partial: Omit<AmendmentVIIApplyResult, "status" | "ckl" | "ok"> & {
    ok?: boolean;
  },
): AmendmentVIIApplyResult {
  return {
    ...partial,
    ok: partial.ok ?? false,
    status: "partial",
    ckl: cklMeta(),
  };
}

function buildFixture(args: {
  id: string;
  scaleClass: string | null;
  profile: BiometricProfile | null;
  metrics: Record<string, number>;
  organicVarianceMeasured: number;
  minOrganicVariance: number;
  symmetryAveraged?: boolean;
}): RenderFixtureForCkl {
  return {
    id: args.id,
    scaleClass: args.scaleClass,
    biometricProfileId: args.profile?.id,
    profile: args.profile ?? undefined,
    metrics: args.metrics,
    organicVarianceMeasured: args.organicVarianceMeasured,
    minOrganicVariance: args.minOrganicVariance,
    symmetryAveraged: args.symmetryAveraged === true,
  };
}

/**
 * Apply Amendment VII gates to raster meshes (soft cinematic by default).
 * Gate deny/HALT authority: CKL only.
 */
export function applyAmendmentVIIToMeshes(
  req: AmendmentVIIApplyRequest,
): AmendmentVIIApplyResult {
  const mode: AmendmentVIIApplyMode =
    req.mode ?? (req.strictHalt ? "strict" : "soft");
  const notes: string[] = [];
  const issues: string[] = [];
  const gates = {
    biometric: "skipped" as "applied" | "halt" | "skipped",
    adaptiveScale: "skipped" as "applied" | "halt" | "skipped",
    organicVariance: "skipped" as "applied" | "halt" | "skipped",
    worldProfile: "skipped" as "applied" | "halt" | "skipped",
  };

  const ckl = getCklAmendmentVII();
  const policyIds = ckl.POLICY_IDS;
  const haltCodes = ckl.HALT_CODES;
  const worldHalt = ckl.WORLD_PROFILE_HALT_CODES;
  const manifest = loadAmendmentVIIPolicyManifest();
  notes.push(
    `ckl-policies: ${manifest.order.join(" → ")}`,
  );
  notes.push(
    `ckl-world-profiles: ${manifest.worldProfileOrder.join(" → ")}`,
  );

  let worldScaleClass: string | null = null;
  let worldProfileOk = true;
  const worldEntitiesIn: WorldEntityForCkl[] = [
    ...(req.worldEntities ?? []),
    ...(req.renderContext
      ? [renderContextToWorldEntity(req.renderContext) as WorldEntityForCkl]
      : []),
  ];
  const needWorld =
    req.requireWorldContext === true ||
    worldEntitiesIn.length > 0 ||
    Boolean(req.renderContext);

  if (
    req.requireWorldContext === true &&
    worldEntitiesIn.length === 0 &&
    !req.worldProfileId &&
    !req.renderContext
  ) {
    gates.worldProfile = "halt";
    return haltResult({
      mode,
      meshes: req.meshes.map((m) => ({ ...m })),
      scaleClass: req.scaleClassOrProfileId,
      uniformScale: 1,
      targetHeadHeightMeters: null,
      measuredAabbHeight: null,
      organicVarianceBefore: null,
      organicVarianceAfter: null,
      asymmetryApplied: false,
      biometricOk: false,
      scaleOk: false,
      organicOk: false,
      worldProfileOk: false,
      haltCode: HALT_MISSING_WORLD_CONTEXT,
      issues: [...issues, "missing-world-profile-id"],
      notes: [
        ...notes,
        "ckl-world-biogeometric-deny — requireWorldContext without profile/entities",
      ],
      gates,
    });
  }

  // --- §2 adaptive-scale via CKL (no silent default) ---
  const scaleClassRaw = String(req.scaleClassOrProfileId ?? "").trim();
  const scaleFixture = buildFixture({
    id: "mesh-scale-probe",
    scaleClass: scaleClassRaw || null,
    profile: null,
    metrics: {},
    organicVarianceMeasured: 0,
    minOrganicVariance: 0,
  });
  const scaleGate = evaluateCklAmendmentVIIGate(
    policyIds.ADAPTIVE_SCALE,
    [scaleFixture],
  );
  if (scaleGate.applies && !scaleGate.ok) {
    gates.adaptiveScale = "halt";
    issues.push(...(scaleGate.issues ?? ["missing-scale-context"]));
    return haltResult({
      mode,
      meshes: req.meshes.map((m) => ({ ...m })),
      scaleClass: req.scaleClassOrProfileId,
      uniformScale: 1,
      targetHeadHeightMeters: null,
      measuredAabbHeight: null,
      organicVarianceBefore: null,
      organicVarianceAfter: null,
      asymmetryApplied: false,
      biometricOk: false,
      scaleOk: false,
      organicOk: false,
      worldProfileOk,
      haltCode: scaleGate.haltCode ?? haltCodes.MISSING_SCALE,
      issues,
      notes: [
        ...notes,
        "HALT:MISSING-SCALE-CONTEXT — CKL policy-adaptive-scale deny",
      ],
      gates,
    });
  }
  gates.adaptiveScale = "applied";

  const catalog = loadBiometricCatalog();
  const profile =
    getBiometricProfile(req.scaleClassOrProfileId, catalog) ??
    getBiometricProfile("human-sized", catalog);
  if (!profile) {
    issues.push("no-biometric-profile");
    // Soft cinematic: no profile → cannot build lawful fixture; CKL biometric
    // would deny missing profile when metrics present. Treat as soft fail.
    return haltResult({
      ok: false,
      mode,
      meshes: req.meshes.map((m) => ({ ...m })),
      scaleClass: req.scaleClassOrProfileId,
      uniformScale: 1,
      targetHeadHeightMeters: null,
      measuredAabbHeight: null,
      organicVarianceBefore: null,
      organicVarianceAfter: null,
      asymmetryApplied: false,
      biometricOk: false,
      scaleOk: true,
      organicOk: false,
      worldProfileOk,
      haltCode: haltCodes.BIOMETRIC,
      issues,
      notes,
      gates,
    });
  }

  const metricCtx: MetricContext = {
    scaleClassOrProfileId: req.scaleClassOrProfileId,
    worldScaleClass: worldScaleClass ?? undefined,
    requireScaleClass: true,
  };
  const inherited = inheritMetricsFromContext(metricCtx, catalog);
  notes.push(...inherited.notes);

  const faceMeshes = req.meshes.filter(isFaceLikeMesh);
  const sample = faceMeshes[0] ?? req.meshes[0];
  let measuredAabbHeight: number | null = null;
  let targetHeadHeightMeters: number | null = null;
  let uniformScale = inherited.uniformScale;

  if (sample) {
    const aabb = computeMeshAabb(sample.positions);
    measuredAabbHeight = aabb.valid ? aabb.max[1]! - aabb.min[1]! : null;
    const headFrac = headFracSafe(profile);
    targetHeadHeightMeters = profile.referenceHeightMeters * headFrac;
    if (
      measuredAabbHeight &&
      measuredAabbHeight > 1e-6 &&
      targetHeadHeightMeters > 0
    ) {
      // Soft-correct oversized fixture heads toward lawful head height.
      const ratio = targetHeadHeightMeters / measuredAabbHeight;
      uniformScale = Math.min(
        1.25,
        Math.max(0.12, ratio * inherited.uniformScale),
      );
      notes.push(
        `biometric scale: aabbH=${measuredAabbHeight.toFixed(3)} → targetHead=${targetHeadHeightMeters.toFixed(3)} uniformScale=${uniformScale.toFixed(4)}`,
      );
    }
  }

  // Post soft-scale metrics for CKL biometric (lawful head fraction after correction).
  const aabbMetrics =
    sample && measuredAabbHeight
      ? metricsFromAabb(computeMeshAabb(sample.positions))
      : null;
  const measuredMetrics: Record<string, number> = {
    headToHeight: headFracSafe(profile),
    asymmetry: Math.max(aabbMetrics?.asymmetryProxy ?? 0.01, 0.01),
    organicVariance: Math.max(
      aabbMetrics?.organicVarianceProxy ?? 0,
      profile.curvature.minOrganicVariance.min,
    ),
    surfaceCurvatureProxy:
      aabbMetrics?.surfaceCurvatureProxy &&
      aabbMetrics.surfaceCurvatureProxy > 0
        ? aabbMetrics.surfaceCurvatureProxy
        : midRange(
            profile.curvature.surfaceCurvatureProxy?.min ?? 0.35,
            profile.curvature.surfaceCurvatureProxy?.max ?? 1.2,
          ),
    centerOfMassHeightFraction: midRange(
      profile.massDistribution.centerOfMassHeightFraction.min,
      profile.massDistribution.centerOfMassHeightFraction.max,
    ),
    shoulderToHipWidth: 1.1,
    armToHeight: midRange(
      profile.limbRatios.armToHeight.min,
      profile.limbRatios.armToHeight.max,
    ),
    legToHeight: midRange(
      profile.limbRatios.legToHeight.min,
      profile.limbRatios.legToHeight.max,
    ),
    torsoToHeight: midRange(
      profile.limbRatios.torsoToHeight.min,
      profile.limbRatios.torsoToHeight.max,
    ),
  };

  const bioFixture = buildFixture({
    id: sample?.id ?? "face-fixture",
    scaleClass: profile.scaleClass,
    profile,
    metrics: measuredMetrics,
    organicVarianceMeasured: measuredMetrics.organicVariance!,
    minOrganicVariance: profile.curvature.minOrganicVariance.min,
  });
  const bioGate = evaluateCklAmendmentVIIGate(policyIds.BIOMETRIC, [
    bioFixture,
  ]);
  if (bioGate.applies && !bioGate.ok) {
    // Soft corrections (scale) already applied above; HALT when CKL denies.
    gates.biometric = "halt";
    return haltResult({
      mode,
      meshes: req.meshes.map((m) => ({ ...m })),
      scaleClass: profile.scaleClass,
      uniformScale,
      targetHeadHeightMeters,
      measuredAabbHeight,
      organicVarianceBefore: null,
      organicVarianceAfter: null,
      asymmetryApplied: false,
      biometricOk: false,
      scaleOk: true,
      organicOk: false,
      worldProfileOk,
      haltCode: bioGate.haltCode ?? haltCodes.BIOMETRIC,
      issues: [...issues, ...(bioGate.issues ?? [])],
      notes: [
        ...notes,
        "HALT:BIOMETRIC-NONCONFORMANCE — CKL policy-biometric-conformance deny",
      ],
      gates,
    });
  }
  const biometricOk = true;
  gates.biometric = "applied";

  let organicVarianceBefore: number | null = null;
  let organicVarianceAfter: number | null = null;
  let asymmetryApplied = false;
  const outMeshes: RasterMesh[] = [];
  const minOrg = profile.curvature.minOrganicVariance.min;

  for (const mesh of req.meshes) {
    const faceLike = isFaceLikeMesh(mesh);
    let positions = mesh.positions;
    if (faceLike) {
      const before = positionOrganicVariance(positions);
      organicVarianceBefore =
        organicVarianceBefore === null
          ? before
          : Math.min(organicVarianceBefore, before);
      // Soft correction: nudge symmetric fixtures before CKL organic gate.
      const aabb = computeMeshAabb(positions);
      const asym = metricsFromAabb(aabb).asymmetryProxy;
      const needsAsym = before < minOrg * 2 || asym < 0.01 || before < minOrg;
      if (needsAsym || before < minOrg) {
        const nudged = applyControlledOrganicAsymmetry(positions, {
          seed: req.organicSeed,
          strength: req.organicStrength,
        });
        positions = nudged.positions;
        organicVarianceAfter =
          organicVarianceAfter === null
            ? nudged.varianceAfter
            : Math.max(organicVarianceAfter, nudged.varianceAfter);
        asymmetryApplied = true;
        notes.push(
          `organic asymmetry on ${mesh.id}: var ${nudged.varianceBefore.toFixed(4)}→${nudged.varianceAfter.toFixed(4)}`,
        );
      } else {
        organicVarianceAfter =
          organicVarianceAfter === null
            ? before
            : Math.max(organicVarianceAfter, before);
      }
    }

    const bakeScale = req.bakeScale !== false;
    const scaledMatrix =
      bakeScale && faceLike && uniformScale !== 1
        ? mulScaleMat4(mesh.modelMatrix, uniformScale)
        : mesh.modelMatrix;

    outMeshes.push({
      ...mesh,
      positions,
      modelMatrix: scaledMatrix,
    });
  }

  // --- §3 organic-variance via CKL on post-correction measurement ---
  const organicMeasured =
    organicVarianceAfter ??
    organicVarianceBefore ??
    measuredMetrics.organicVariance!;
  const organicFixture = buildFixture({
    id: sample?.id ?? "face-organic",
    scaleClass: profile.scaleClass,
    profile,
    metrics: {
      ...measuredMetrics,
      organicVariance: organicMeasured,
    },
    organicVarianceMeasured: organicMeasured,
    minOrganicVariance: minOrg,
    symmetryAveraged: false,
  });
  const organicGate = evaluateCklAmendmentVIIGate(
    policyIds.ORGANIC_VARIANCE,
    [organicFixture],
  );
  if (organicGate.applies && !organicGate.ok) {
    gates.organicVariance = "halt";
    return haltResult({
      mode,
      meshes: req.meshes.map((m) => ({ ...m })),
      scaleClass: profile.scaleClass,
      uniformScale,
      targetHeadHeightMeters,
      measuredAabbHeight,
      organicVarianceBefore,
      organicVarianceAfter,
      asymmetryApplied,
      biometricOk,
      scaleOk: true,
      organicOk: false,
      worldProfileOk,
      haltCode: organicGate.haltCode ?? haltCodes.ORGANIC_VARIANCE,
      issues: [...issues, ...(organicGate.issues ?? [])],
      notes: [
        ...notes,
        "HALT:ORGANIC-VARIANCE-VIOLATION — CKL policy-organic-variance deny",
      ],
      gates,
    });
  }
  gates.organicVariance = "applied";
  notes.push(`EI=${EI_ORGANIC_VARIANCE}; mode=${mode}; ckl-wired`);

  // --- World-profile law (user patch §4): scaleContext → biogeometric → remaining ---
  if (needWorld) {
    const eco = inheritEcologicalScale({
      worldProfileId: req.worldProfileId ?? undefined,
      requireWorldContext: req.requireWorldContext === true,
    });
    if (eco.ok && eco.worldScaleClass) {
      worldScaleClass = eco.worldScaleClass;
      notes.push(...eco.notes);
    }

    const objectTypeToProfile: Record<string, string> = {
      biogeometric: "world.biogeometric",
      human: "world.biogeometric",
      animal: "world.biogeometric",
      terrain: "world.terrain",
      architecture: "world.architecture",
      water: "world.water",
      plant: "world.plant",
      synthetic: "world.synthetic",
      material: "world.material",
    };

    const correctedEntities: WorldEntityForCkl[] = worldEntitiesIn.map((e) => {
      const profileId =
        e.worldProfileId ??
        req.worldProfileId ??
        (e.objectType
          ? objectTypeToProfile[String(e.objectType).toLowerCase()] ?? null
          : null);
      const loaded = profileId ? loadWorldProfile(profileId) : null;
      const profile = loaded?.profile as
        | { worldScaleClass?: string; minEnvironmentalVariance?: number }
        | null
        | undefined;
      const inheritedScale =
        e.scaleClass ??
        e.parentContext?.scaleClass ??
        e.worldContext?.worldScaleClass ??
        e.terrainContext?.worldScaleClass ??
        e.architecturalContext?.worldScaleClass ??
        e.architectureContext?.worldScaleClass ??
        profile?.worldScaleClass ??
        worldScaleClass ??
        (req.scaleClassOrProfileId?.trim() || null);
      const minVar =
        e.minEnvironmentalVariance ??
        profile?.minEnvironmentalVariance ??
        0.001;
      let envVar = e.environmentalVarianceMeasured ?? e.organicVarianceMeasured;
      if (typeof envVar !== "number" || envVar < minVar) {
        envVar = Math.max(
          minVar,
          typeof envVar === "number" ? envVar * 1.5 : minVar * 2,
        );
        notes.push(
          `world-profile variance soft-correct ${e.id}: → ${envVar.toFixed(4)}`,
        );
      }
      return {
        ...e,
        worldProfileId: profileId,
        scaleClass: inheritedScale,
        environmentalVarianceMeasured: envVar,
        minEnvironmentalVariance: minVar,
        worldContext: {
          ...e.worldContext,
          worldScaleClass:
            e.worldContext?.worldScaleClass ??
            worldScaleClass ??
            inheritedScale ??
            undefined,
          worldProfileId:
            e.worldContext?.worldProfileId ?? profileId ?? undefined,
        },
      };
    });

    const entitiesForGate =
      correctedEntities.length > 0
        ? correctedEntities
        : [
            {
              id: "world-context-probe",
              objectType: "biogeometric",
              worldProfileId: req.worldProfileId ?? "world.biogeometric",
              scaleClass: worldScaleClass ?? (scaleClassRaw || null),
            },
          ];

    const gateOpts = {
      worldScaleClass,
      worldProfileId: req.worldProfileId,
    };

    // 2. world.scaleContext
    const scaleCtxGate = evaluateCklWorldProfileGate(
      "world.scaleContext",
      entitiesForGate,
      gateOpts,
    );
    if (scaleCtxGate.applies && !scaleCtxGate.ok) {
      gates.worldProfile = "halt";
      return haltResult({
        mode,
        meshes: req.meshes.map((m) => ({ ...m })),
        scaleClass: profile.scaleClass,
        uniformScale,
        targetHeadHeightMeters,
        measuredAabbHeight,
        organicVarianceBefore,
        organicVarianceAfter,
        asymmetryApplied,
        biometricOk: true,
        scaleOk: true,
        organicOk: true,
        worldProfileOk: false,
        haltCode: scaleCtxGate.haltCode ?? worldHalt?.MISSING_SCALE ?? null,
        issues: [...issues, ...(scaleCtxGate.issues ?? [])],
        notes: [...notes, "ckl-world-scaleContext-deny"],
        gates,
      });
    }

    // 3. world.biogeometric (requires biometric + adaptiveScale — already applied)
    const bioGeoGate = evaluateCklWorldProfileGate(
      "world.biogeometric",
      entitiesForGate,
      gateOpts,
    );
    if (bioGeoGate.applies && !bioGeoGate.ok) {
      gates.worldProfile = "halt";
      return haltResult({
        mode,
        meshes: req.meshes.map((m) => ({ ...m })),
        scaleClass: profile.scaleClass,
        uniformScale,
        targetHeadHeightMeters,
        measuredAabbHeight,
        organicVarianceBefore,
        organicVarianceAfter,
        asymmetryApplied,
        biometricOk: true,
        scaleOk: true,
        organicOk: true,
        worldProfileOk: false,
        haltCode:
          bioGeoGate.haltCode ??
          worldHalt?.MISSING_WORLD_CONTEXT ??
          HALT_MISSING_WORLD_CONTEXT,
        issues: [...issues, ...(bioGeoGate.issues ?? [])],
        notes: [...notes, "ckl-world-biogeometric-deny"],
        gates,
      });
    }

    // 4. remaining world kinds
    for (const kind of CKL_WORLD_PROFILE_APPLY_REMAINING) {
      const res = evaluateCklWorldProfileGate(kind, entitiesForGate, gateOpts);
      if (res.applies && !res.ok) {
        gates.worldProfile = "halt";
        return haltResult({
          mode,
          meshes: req.meshes.map((m) => ({ ...m })),
          scaleClass: profile.scaleClass,
          uniformScale,
          targetHeadHeightMeters,
          measuredAabbHeight,
          organicVarianceBefore,
          organicVarianceAfter,
          asymmetryApplied,
          biometricOk: true,
          scaleOk: true,
          organicOk: true,
          worldProfileOk: false,
          haltCode: res.haltCode ?? worldHalt?.WORLD_PROFILE_NONCONFORMANCE ?? null,
          issues: [...issues, ...(res.issues ?? [])],
          notes: [...notes, `ckl-${kind}-deny`],
          gates,
        });
      }
    }

    gates.worldProfile = "applied";
    worldProfileOk = true;
    notes.push(
      "world-profile CKL: scaleContext → biogeometric → remaining (partial)",
    );
  }

  return {
    ok: true,
    status: "partial",
    mode,
    meshes: outMeshes,
    scaleClass: profile.scaleClass,
    uniformScale,
    targetHeadHeightMeters,
    measuredAabbHeight,
    organicVarianceBefore,
    organicVarianceAfter,
    asymmetryApplied,
    biometricOk,
    scaleOk: true,
    organicOk: true,
    worldProfileOk,
    haltCode: null,
    issues,
    notes,
    gates,
    ckl: cklMeta(),
  };
}

/**
 * Apply Amendment VII/VIII from Engine3D RenderContext (user patch §4–5).
 */
export function applyAmendmentVIIFromRenderContext(
  meshes: readonly RasterMesh[],
  ctx: RenderContext,
  options?: Omit<AmendmentVIIApplyRequest, "meshes" | "renderContext" | "scaleClassOrProfileId">,
): AmendmentVIIApplyResult {
  return applyAmendmentVIIToMeshes({
    meshes,
    scaleClassOrProfileId:
      ctx.scaleClassOrProfileId ??
      ctx.object.scaleClass ??
      ctx.world.worldScaleClass ??
      "human-sized",
    renderContext: ctx,
    requireWorldContext: ctx.requireWorldContext ?? true,
    worldProfileId: ctx.object.worldProfile,
    ...options,
  });
}
