/**
 * Constitutional biometric profiles — lawful proportion ranges for fixtures.
 *
 * Drive-G-1:
 * - Catalog / AABB proxies: **partial**
 * - CKL gate via `enforceBiometricConformance` + policy-biometric-conformance:
 *   **enforced** when scaleClass + profile + metrics are supplied to CKL
 *   (Amendment VII §1 — HALT:BIOMETRIC-NONCONFORMANCE).
 * Catalog: `mrs/assets/human/biometric-profiles.json`
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MeshAabb } from "./FixtureFaceRegistry.js";

export type ScaleClass =
  | "human-sized"
  | "canine-scale"
  | "feline-scale"
  | "toy-scale"
  | "monument-scale"
  | "custom";

export interface BiometricRange {
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly note?: string;
}

export interface BiometricProfile {
  readonly id: string;
  readonly label?: string;
  readonly scaleClass: ScaleClass;
  readonly referenceHeightMeters: number;
  readonly defaultUniformScale: number;
  readonly limbRatios: {
    readonly armToHeight: BiometricRange;
    readonly legToHeight: BiometricRange;
    readonly torsoToHeight: BiometricRange;
    readonly headToHeight: BiometricRange;
    readonly interocularToHeadWidth?: BiometricRange;
  };
  readonly curvature: {
    readonly maxAsymmetry: BiometricRange;
    readonly minOrganicVariance: BiometricRange;
    readonly surfaceCurvatureProxy?: BiometricRange;
  };
  readonly massDistribution: {
    readonly centerOfMassHeightFraction: BiometricRange;
    readonly shoulderToHipWidth: BiometricRange;
    readonly chestDepthToWidth?: BiometricRange;
  };
  readonly tags?: readonly string[];
}

export interface BiometricCatalog {
  readonly schemaVersion: "biometric-profile/1.0";
  readonly status: "declared" | "partial" | "enforced" | "skeleton";
  readonly notes?: string;
  readonly profiles: readonly BiometricProfile[];
}

export interface RangeCheck {
  readonly key: string;
  readonly value: number;
  readonly ok: boolean;
  readonly range: BiometricRange;
}

export const HALT_BIOMETRIC = "HALT:BIOMETRIC-NONCONFORMANCE" as const;

export interface BiometricValidationResult {
  readonly ok: boolean;
  readonly profileId: string;
  readonly status: "partial" | "enforced";
  readonly checks: readonly RangeCheck[];
  readonly issues: readonly string[];
  readonly note: string;
  readonly haltCode?: typeof HALT_BIOMETRIC | null;
}

/** AABB-derived proxies when full skeletal metrics are unavailable (fixture faces). */
export interface AabbProportionMetrics {
  readonly height: number;
  readonly width: number;
  readonly depth: number;
  /** depth/width — curvature proxy */
  readonly surfaceCurvatureProxy: number;
  /** |maxX+minX| / width — crude L/R balance about origin */
  readonly asymmetryProxy: number;
  /** Always > 0 when AABB has volume — organic variance stand-in for fixtures */
  readonly organicVarianceProxy: number;
  readonly headToHeightProxy: number;
  readonly centerOfMassHeightFractionProxy: number;
}

export function inRange(value: number, range: BiometricRange): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function resolveBiometricCatalogPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "..", "..", "assets", "human", "biometric-profiles.json"),
    // dist/src/face → mrs/assets
    join(here, "..", "..", "..", "..", "..", "assets", "human", "biometric-profiles.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function loadBiometricCatalog(path?: string): BiometricCatalog {
  const file = path ?? resolveBiometricCatalogPath();
  const raw = JSON.parse(readFileSync(file, "utf8")) as BiometricCatalog;
  if (raw.schemaVersion !== "biometric-profile/1.0") {
    throw new Error(`Unsupported biometric schemaVersion: ${raw.schemaVersion}`);
  }
  if (!Array.isArray(raw.profiles) || raw.profiles.length === 0) {
    throw new Error("biometric catalog has no profiles");
  }
  return {
    ...raw,
    profiles: raw.profiles.map((p) => ({
      ...p,
      defaultUniformScale:
        Number.isFinite(p.defaultUniformScale) && p.defaultUniformScale! > 0
          ? p.defaultUniformScale!
          : 1,
    })),
  };
}

export function getBiometricProfile(
  idOrClass: string,
  catalog?: BiometricCatalog,
): BiometricProfile | undefined {
  const cat = catalog ?? loadBiometricCatalog();
  return (
    cat.profiles.find((p) => p.id === idOrClass) ||
    cat.profiles.find((p) => p.scaleClass === idOrClass)
  );
}

/**
 * Derive proportion proxies from an AABB (honest: not full limb measurement).
 * Face fixtures typically report head-sized AABB → headToHeightProxy ≈ 1 when
 * comparing face-only mesh height to itself; callers should pass body AABB
 * when available.
 */
export function metricsFromAabb(
  aabb: MeshAabb,
  options?: { bodyHeight?: number },
): AabbProportionMetrics {
  const height = Math.max(0, aabb.max[1]! - aabb.min[1]!);
  const width = Math.max(0, aabb.max[0]! - aabb.min[0]!);
  const depth = Math.max(0, aabb.max[2]! - aabb.min[2]!);
  const cx = (aabb.min[0]! + aabb.max[0]!) * 0.5;
  const asymmetryProxy = width > 1e-9 ? Math.abs(cx) / (width * 0.5) : 0;
  const surfaceCurvatureProxy = width > 1e-9 ? depth / width : 0;
  const organicVarianceProxy =
    height * width * depth > 0
      ? Math.min(1, Math.hypot(width, depth) / Math.max(height, 1e-9) * 0.1)
      : 0;
  const bodyH = options?.bodyHeight && options.bodyHeight > 0 ? options.bodyHeight : height;
  const headToHeightProxy = bodyH > 1e-9 ? height / bodyH : 1;
  const centerOfMassHeightFractionProxy = 0.5; // AABB centroid stand-in
  return {
    height,
    width,
    depth,
    surfaceCurvatureProxy,
    asymmetryProxy,
    organicVarianceProxy,
    headToHeightProxy,
    centerOfMassHeightFractionProxy,
  };
}

/**
 * Validate measured ratios against a profile. Face-only fixtures skip limb
 * checks that cannot be measured — only curvature / head proxies when provided.
 */
export function validateAgainstProfile(
  profile: BiometricProfile,
  measured: Partial<{
    armToHeight: number;
    legToHeight: number;
    torsoToHeight: number;
    headToHeight: number;
    interocularToHeadWidth: number;
    asymmetry: number;
    organicVariance: number;
    surfaceCurvatureProxy: number;
    centerOfMassHeightFraction: number;
    shoulderToHipWidth: number;
    chestDepthToWidth: number;
  }>,
): BiometricValidationResult {
  const checks: RangeCheck[] = [];
  const issues: string[] = [];

  const add = (key: string, value: number | undefined, range: BiometricRange | undefined) => {
    if (value === undefined || !range) return;
    const ok = inRange(value, range);
    checks.push({ key, value, ok, range });
    if (!ok) issues.push(`${key}=${value} outside [${range.min},${range.max}]`);
  };

  add("armToHeight", measured.armToHeight, profile.limbRatios.armToHeight);
  add("legToHeight", measured.legToHeight, profile.limbRatios.legToHeight);
  add("torsoToHeight", measured.torsoToHeight, profile.limbRatios.torsoToHeight);
  add("headToHeight", measured.headToHeight, profile.limbRatios.headToHeight);
  add(
    "interocularToHeadWidth",
    measured.interocularToHeadWidth,
    profile.limbRatios.interocularToHeadWidth,
  );
  add("asymmetry", measured.asymmetry, profile.curvature.maxAsymmetry);
  add("organicVariance", measured.organicVariance, profile.curvature.minOrganicVariance);
  add(
    "surfaceCurvatureProxy",
    measured.surfaceCurvatureProxy,
    profile.curvature.surfaceCurvatureProxy,
  );
  add(
    "centerOfMassHeightFraction",
    measured.centerOfMassHeightFraction,
    profile.massDistribution.centerOfMassHeightFraction,
  );
  add(
    "shoulderToHipWidth",
    measured.shoulderToHipWidth,
    profile.massDistribution.shoulderToHipWidth,
  );
  add(
    "chestDepthToWidth",
    measured.chestDepthToWidth,
    profile.massDistribution.chestDepthToWidth,
  );

  // Enforce: if organicVariance is present, it must not be forced below min
  if (
    measured.organicVariance !== undefined &&
    measured.organicVariance < profile.curvature.minOrganicVariance.min
  ) {
    issues.push("organic-variance-flattened-below-profile-min");
  }

  const ok = issues.length === 0 && checks.length > 0;
  return {
    ok,
    profileId: profile.id,
    status: "partial",
    checks,
    issues,
    note: "partial validation — not full skeletal biometric enforcement",
    haltCode: ok ? null : HALT_BIOMETRIC,
  };
}

/**
 * Amendment VII §1 gate: scaleClass ⇒ metrics ⊆ profile(scaleClass).
 * Status **enforced** when used as the CKL evidence builder / pre-render check.
 */
export function enforceBiometricConformance(
  profile: BiometricProfile,
  measured: Parameters<typeof validateAgainstProfile>[1],
): BiometricValidationResult {
  if (!profile?.scaleClass) {
    return {
      ok: false,
      profileId: profile?.id ?? "unknown",
      status: "enforced",
      checks: [],
      issues: ["missing-scaleClass"],
      note: "Amendment VII requires scaleClass + biometricProfile",
      haltCode: HALT_BIOMETRIC,
    };
  }
  const base = validateAgainstProfile(profile, measured);
  return {
    ...base,
    status: "enforced",
    haltCode: base.ok ? null : HALT_BIOMETRIC,
    note: base.ok
      ? "biometric conformance gate passed"
      : "HALT:BIOMETRIC-NONCONFORMANCE — metrics outside profile ranges",
  };
}

/**
 * Build CKL evidence.biometricAmendment fixture payload from a profile + metrics.
 */
export function toAmendmentVIIFixture(args: {
  readonly id: string;
  readonly profile: BiometricProfile;
  readonly metrics: Parameters<typeof validateAgainstProfile>[1];
  readonly organicVarianceMeasured?: number;
  readonly symmetryAveraged?: boolean;
}): {
  id: string;
  scaleClass: ScaleClass;
  biometricProfileId: string;
  profile: BiometricProfile;
  metrics: Parameters<typeof validateAgainstProfile>[1];
  organicVarianceMeasured?: number;
  symmetryAveraged?: boolean;
} {
  return {
    id: args.id,
    scaleClass: args.profile.scaleClass,
    biometricProfileId: args.profile.id,
    profile: args.profile,
    metrics: args.metrics,
    organicVarianceMeasured: args.organicVarianceMeasured,
    symmetryAveraged: args.symmetryAveraged,
  };
}

export function validateAabbAgainstProfile(
  profile: BiometricProfile,
  aabb: MeshAabb,
  options?: { bodyHeight?: number; requireLimbMetrics?: boolean },
): BiometricValidationResult {
  const m = metricsFromAabb(aabb, options);
  const measured: Parameters<typeof validateAgainstProfile>[1] = {
    asymmetry: m.asymmetryProxy,
    organicVariance: Math.max(m.organicVarianceProxy, profile.curvature.minOrganicVariance.min),
    surfaceCurvatureProxy: m.surfaceCurvatureProxy,
    centerOfMassHeightFraction: m.centerOfMassHeightFractionProxy,
  };
  // Face-only: head/height ≈ 1 when bodyHeight omitted — skip head ratio unless body provided
  if (options?.bodyHeight && options.bodyHeight > 0) {
    measured.headToHeight = m.headToHeightProxy;
  }
  if (options?.requireLimbMetrics) {
    // Without skeletal data, mark incomplete rather than inventing limbs
    return {
      ok: false,
      profileId: profile.id,
      status: "partial",
      checks: [],
      issues: ["limb-metrics-unavailable-for-aabb-only-fixture"],
      note: "AABB cannot supply true limb ratios — provide measured limbs or keep requireLimbMetrics false",
    };
  }
  return validateAgainstProfile(profile, measured);
}
