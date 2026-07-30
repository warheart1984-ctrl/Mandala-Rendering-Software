/**
 * Adaptive metric inheritance — fixtures inherit scale from contextual entities.
 *
 * Status:
 * - Inheritance math: **partial** (uniform scale only; not bone retarget).
 * - Required scaleClass gate (Amendment VII §2): **enforced** when
 *   `requireScaleContext` / CKL `policy-adaptive-scale` is used — missing
 *   scale context → HALT:MISSING-SCALE-CONTEXT (proven via CKL tests).
 */

import type { Vec3Tuple } from "../world/WorldObject.js";
import {
  getBiometricProfile,
  loadBiometricCatalog,
  type BiometricCatalog,
  type BiometricProfile,
  type ScaleClass,
} from "./BiometricProfile.js";

export const HALT_MISSING_SCALE = "HALT:MISSING-SCALE-CONTEXT" as const;

export interface MetricContext {
  /** Named scale class or profile id */
  readonly scaleClassOrProfileId?: string;
  /** Explicit context entity height in meters (e.g. measured human standing height) */
  readonly contextHeightMeters?: number;
  /** Optional override multiplier after inheritance */
  readonly scaleMultiplier?: number;
  /** When set, inherit relative to another entity's uniform scale */
  readonly parentUniformScale?: number;
  /** Parent / world scale class for inheritance when fixture omits its own */
  readonly parentScaleClass?: ScaleClass | string;
  readonly worldScaleClass?: ScaleClass | string;
  /**
   * When true, missing scaleClass (and no parent/world inherit) throws / returns halt.
   * Amendment VII §2 — required scene/render pipeline stage.
   */
  readonly requireScaleClass?: boolean;
}

export interface InheritedMetrics {
  readonly profile: BiometricProfile;
  readonly uniformScale: number;
  readonly scaleVec: Vec3Tuple;
  readonly scaleClass: ScaleClass;
  readonly status: "partial" | "enforced";
  readonly basis: "context-height" | "defaultUniformScale" | "parent-scale";
  readonly notes: readonly string[];
}

export interface ScaleContextResult {
  readonly ok: boolean;
  readonly scaleClass: string | null;
  readonly haltCode: typeof HALT_MISSING_SCALE | null;
  readonly source: "declared" | "parent" | "world" | "none";
  readonly issues: readonly string[];
}

/**
 * Amendment VII §2 — fixtures must declare or inherit scaleClass.
 * Missing → HALT:MISSING-SCALE-CONTEXT.
 */
export function requireScaleContext(context: MetricContext = {}): ScaleContextResult {
  const declared = context.scaleClassOrProfileId;
  if (declared && String(declared).trim()) {
    return {
      ok: true,
      scaleClass: String(declared),
      haltCode: null,
      source: "declared",
      issues: [],
    };
  }
  if (context.parentScaleClass && String(context.parentScaleClass).trim()) {
    return {
      ok: true,
      scaleClass: String(context.parentScaleClass),
      haltCode: null,
      source: "parent",
      issues: [],
    };
  }
  if (context.worldScaleClass && String(context.worldScaleClass).trim()) {
    return {
      ok: true,
      scaleClass: String(context.worldScaleClass),
      haltCode: null,
      source: "world",
      issues: [],
    };
  }
  return {
    ok: false,
    scaleClass: null,
    haltCode: HALT_MISSING_SCALE,
    source: "none",
    issues: ["missing-scale-context"],
  };
}

/**
 * Resolve uniform scale so a fixture inherits from context.
 * Example: canine-scale profile with human-sized context height → smaller scale.
 *
 * When `requireScaleClass: true` and no scale can be resolved, throws with
 * HALT:MISSING-SCALE-CONTEXT (Amendment VII).
 */
export function inheritMetricsFromContext(
  context: MetricContext = {},
  catalog?: BiometricCatalog,
): InheritedMetrics {
  if (context.requireScaleClass) {
    const gate = requireScaleContext(context);
    if (!gate.ok) {
      const err = new Error(HALT_MISSING_SCALE);
      (err as Error & { haltCode: string }).haltCode = HALT_MISSING_SCALE;
      throw err;
    }
  }

  const cat = catalog ?? loadBiometricCatalog();
  const key =
    context.scaleClassOrProfileId ??
    context.parentScaleClass ??
    context.worldScaleClass ??
    (context.requireScaleClass ? undefined : "human-sized");
  if (!key) {
    const err = new Error(HALT_MISSING_SCALE);
    (err as Error & { haltCode: string }).haltCode = HALT_MISSING_SCALE;
    throw err;
  }
  const profile =
    getBiometricProfile(key, cat) ?? getBiometricProfile("human-sized", cat);
  if (!profile) {
    throw new Error(`No biometric profile for ${key}`);
  }

  const notes: string[] = [];
  let uniformScale = profile.defaultUniformScale;
  let basis: InheritedMetrics["basis"] = "defaultUniformScale";

  if (
    context.contextHeightMeters !== undefined &&
    Number.isFinite(context.contextHeightMeters) &&
    context.contextHeightMeters > 0 &&
    profile.referenceHeightMeters > 0
  ) {
    uniformScale = profile.referenceHeightMeters / context.contextHeightMeters;
    basis = "context-height";
    notes.push(
      `scale = referenceHeight(${profile.referenceHeightMeters}) / contextHeight(${context.contextHeightMeters})`,
    );
  } else if (
    context.parentUniformScale !== undefined &&
    Number.isFinite(context.parentUniformScale) &&
    context.parentUniformScale > 0
  ) {
    uniformScale = context.parentUniformScale * profile.defaultUniformScale;
    basis = "parent-scale";
    notes.push(
      `scale = parent(${context.parentUniformScale}) * default(${profile.defaultUniformScale})`,
    );
  } else {
    notes.push(`scale = defaultUniformScale(${profile.defaultUniformScale})`);
  }

  if (
    context.scaleMultiplier !== undefined &&
    Number.isFinite(context.scaleMultiplier)
  ) {
    uniformScale *= context.scaleMultiplier;
    notes.push(`applied multiplier ${context.scaleMultiplier}`);
  }

  if (!(uniformScale > 0) || !Number.isFinite(uniformScale)) {
    uniformScale = 1;
    notes.push("fallback uniformScale=1");
  }

  return {
    profile,
    uniformScale,
    scaleVec: [uniformScale, uniformScale, uniformScale],
    scaleClass: profile.scaleClass,
    status: context.requireScaleClass ? "enforced" : "partial",
    basis,
    notes,
  };
}

/** Apply inherited uniform scale to a model matrix translation-friendly scale triple. */
export function scaleTripleFromInheritance(inherited: InheritedMetrics): Vec3Tuple {
  return inherited.scaleVec;
}
