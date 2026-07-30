/**
 * Ecological inheritance — world profile → Amendment VII worldScaleClass.
 *
 * Status: **partial**
 * - Loads one biogeometric foothold catalog (`mrs/assets/world/biogeometric-profiles.json`).
 * - Resolves `worldScaleClass` for MetricInheritance / CKL adaptive-scale.
 * - Does **not** enforce domain metric ranges, ecology sim, or CIS SCAL opcodes.
 *
 * Drive-G-1: not a constitutional world engine; foothold only.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MetricContext } from "./MetricInheritance.js";
import { requireScaleContext, HALT_MISSING_SCALE } from "./MetricInheritance.js";

export const HALT_MISSING_WORLD_CONTEXT = "HALT:MISSING-WORLD-CONTEXT" as const;

export type BiogeometricDomain =
  | "biological"
  | "geological"
  | "synthetic"
  | "atmospheric"
  | "biogeometric"
  | "terrain"
  | "architecture"
  | "water"
  | "plant";

export interface WorldProfile {
  readonly id: string;
  readonly label?: string;
  readonly domain: BiogeometricDomain;
  readonly status: "partial" | "declared" | "skeleton";
  /** Feeds MetricInheritance / Amendment VII adaptive-scale */
  readonly worldScaleClass: string;
  readonly referenceLandmarkMeters?: number;
  readonly biomeTag?: string;
  readonly exampleSubjects?: readonly string[];
  readonly metricFamilies?: readonly string[];
  readonly notes?: string;
}

export interface BiogeometricCatalog {
  readonly schemaVersion: "biogeometric-profile/0.1-partial";
  readonly status: "partial";
  readonly dependsOn: "ckl-amendment-vii-biometric-organic";
  readonly promotionPath?: string;
  readonly notes?: string;
  readonly profiles: readonly WorldProfile[];
}

export interface EcologicalScaleResult {
  readonly ok: boolean;
  readonly status: "partial";
  readonly worldProfileId: string | null;
  readonly worldScaleClass: string | null;
  readonly domain: BiogeometricDomain | null;
  readonly biomeTag: string | null;
  readonly referenceLandmarkMeters: number | null;
  readonly metricContext: MetricContext;
  readonly haltCode: typeof HALT_MISSING_WORLD_CONTEXT | typeof HALT_MISSING_SCALE | null;
  readonly issues: readonly string[];
  readonly notes: readonly string[];
}

export interface EcologicalInheritArgs {
  readonly worldProfileId?: string;
  /** Optional WorldDocument-ish fragment */
  readonly worldDoc?: {
    readonly worldProfileId?: string;
    readonly biogeometric?: { readonly profileId?: string };
    readonly id?: string;
  };
  readonly catalog?: BiogeometricCatalog;
  /** When true, missing world profile → HALT:MISSING-WORLD-CONTEXT */
  readonly requireWorldContext?: boolean;
}

export function resolveBiogeometricCatalogPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "..", "..", "assets", "world", "biogeometric-profiles.json"),
    join(
      here,
      "..",
      "..",
      "..",
      "..",
      "..",
      "assets",
      "world",
      "biogeometric-profiles.json",
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function loadBiogeometricCatalog(path?: string): BiogeometricCatalog {
  const file = path ?? resolveBiogeometricCatalogPath();
  const raw = JSON.parse(readFileSync(file, "utf8")) as BiogeometricCatalog;
  if (raw.schemaVersion !== "biogeometric-profile/0.1-partial") {
    throw new Error(
      `Unsupported biogeometric schemaVersion: ${String(raw.schemaVersion)}`,
    );
  }
  if (raw.status !== "partial") {
    throw new Error(`Expected biogeometric status partial, got ${String(raw.status)}`);
  }
  if (!Array.isArray(raw.profiles) || raw.profiles.length === 0) {
    throw new Error("biogeometric catalog has no profiles");
  }
  return raw;
}

export function getWorldProfile(
  id: string,
  catalog?: BiogeometricCatalog,
): WorldProfile | undefined {
  const cat = catalog ?? loadBiogeometricCatalog();
  return cat.profiles.find((p) => p.id === id);
}

/**
 * Resolve ecological scale from world profile into MetricContext.worldScaleClass.
 */
export function inheritEcologicalScale(
  args: EcologicalInheritArgs = {},
): EcologicalScaleResult {
  const notes: string[] = [];
  const issues: string[] = [];
  const cat = args.catalog ?? loadBiogeometricCatalog();
  const profileId =
    args.worldProfileId ??
    args.worldDoc?.worldProfileId ??
    args.worldDoc?.biogeometric?.profileId ??
    null;

  if (!profileId) {
    issues.push("missing-world-profile-id");
    if (args.requireWorldContext) {
      return {
        ok: false,
        status: "partial",
        worldProfileId: null,
        worldScaleClass: null,
        domain: null,
        biomeTag: null,
        referenceLandmarkMeters: null,
        metricContext: {},
        haltCode: HALT_MISSING_WORLD_CONTEXT,
        issues,
        notes: ["requireWorldContext but no worldProfileId"],
      };
    }
    return {
      ok: false,
      status: "partial",
      worldProfileId: null,
      worldScaleClass: null,
      domain: null,
      biomeTag: null,
      referenceLandmarkMeters: null,
      metricContext: {},
      haltCode: null,
      issues,
      notes: ["no world profile requested"],
    };
  }

  const profile = getWorldProfile(profileId, cat);
  if (!profile) {
    issues.push(`unknown-world-profile:${profileId}`);
    return {
      ok: false,
      status: "partial",
      worldProfileId: profileId,
      worldScaleClass: null,
      domain: null,
      biomeTag: null,
      referenceLandmarkMeters: null,
      metricContext: {},
      haltCode: args.requireWorldContext ? HALT_MISSING_WORLD_CONTEXT : null,
      issues,
      notes: [`profile ${profileId} not in catalog`],
    };
  }

  if (!profile.worldScaleClass || !String(profile.worldScaleClass).trim()) {
    issues.push("world-profile-missing-worldScaleClass");
    return {
      ok: false,
      status: "partial",
      worldProfileId: profile.id,
      worldScaleClass: null,
      domain: profile.domain,
      biomeTag: profile.biomeTag ?? null,
      referenceLandmarkMeters: profile.referenceLandmarkMeters ?? null,
      metricContext: {},
      haltCode: HALT_MISSING_SCALE,
      issues,
      notes: ["world profile lacks worldScaleClass"],
    };
  }

  notes.push(
    `ecological inherit: ${profile.id} (${profile.domain}) → worldScaleClass=${profile.worldScaleClass}`,
  );

  const metricContext: MetricContext = {
    worldScaleClass: profile.worldScaleClass,
    contextHeightMeters:
      profile.referenceLandmarkMeters && profile.referenceLandmarkMeters > 0
        ? profile.referenceLandmarkMeters
        : undefined,
    requireScaleClass: true,
  };

  const scaleGate = requireScaleContext(metricContext);
  if (!scaleGate.ok) {
    return {
      ok: false,
      status: "partial",
      worldProfileId: profile.id,
      worldScaleClass: null,
      domain: profile.domain,
      biomeTag: profile.biomeTag ?? null,
      referenceLandmarkMeters: profile.referenceLandmarkMeters ?? null,
      metricContext,
      haltCode: HALT_MISSING_SCALE,
      issues: [...issues, ...scaleGate.issues],
      notes,
    };
  }

  return {
    ok: true,
    status: "partial",
    worldProfileId: profile.id,
    worldScaleClass: profile.worldScaleClass,
    domain: profile.domain,
    biomeTag: profile.biomeTag ?? null,
    referenceLandmarkMeters: profile.referenceLandmarkMeters ?? null,
    metricContext,
    haltCode: null,
    issues: [],
    notes,
  };
}
