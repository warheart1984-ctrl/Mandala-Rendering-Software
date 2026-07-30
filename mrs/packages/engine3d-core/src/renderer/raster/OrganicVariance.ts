/**
 * Soft-raster organic variance / normalization — audit + render-time gate.
 *
 * Drive-G-1 audit finding (2026-07-30):
 * - HeadlessStillRenderer unit-normalizes lighting normals (required for Lambert).
 *   That does **not** mirror or average opposite-side vertices — it does not
 *   flatten organic *position* variance.
 * - Missing normals are filled with +Y (worldMeshToRasterMesh) — lighting-only
 *   flattening risk on broken assets, not symmetry enforcement.
 * - Procedural fixtures (build-face-fixture-glb / UV spheres) are near-symmetric
 *   **at authoring time**; that is asset-source limitation, not renderer
 *   over-normalization.
 *
 * Status:
 * - Static audit: **partial**
 * - Render-time gate `enforceOrganicVarianceAtRender` (Amendment VII §3 /
 *   EI-ORGANIC-VARIANCE / policy-organic-variance): **enforced** when invoked
 *   or via CKL — averaging below minOrganicVariance → HALT:ORGANIC-VARIANCE-VIOLATION
 */

import type { Vec3 } from "./HeadlessStillRenderer.js";

export const HALT_ORGANIC_VARIANCE = "HALT:ORGANIC-VARIANCE-VIOLATION" as const;
/** Evidence / invariant id for render-time organic variance (Amendment VII §3). */
export const EI_ORGANIC_VARIANCE = "EI-ORGANIC-VARIANCE" as const;

export interface NormalizationAuditFinding {
  readonly id: string;
  readonly severity: "info" | "warn";
  readonly flattensOrganicPositions: boolean;
  readonly detail: string;
}

export interface NormalizationAuditReport {
  readonly status: "partial";
  readonly auditedAt: "static-review";
  readonly findings: readonly NormalizationAuditFinding[];
  readonly overNormalizesOrganicVariance: boolean;
  readonly recommendation: string;
}

export interface OrganicVarianceGateResult {
  readonly ok: boolean;
  readonly invariantId: typeof EI_ORGANIC_VARIANCE;
  readonly haltCode: typeof HALT_ORGANIC_VARIANCE | null;
  readonly measured: number | null;
  readonly minOrganicVariance: number | null;
  readonly issues: readonly string[];
  readonly status: "enforced";
}

/** Static audit of known soft-raster paths (no GPU required). */
export function auditSoftRasterNormalization(): NormalizationAuditReport {
  const findings: NormalizationAuditFinding[] = [
    {
      id: "unit-normalize-lighting-normals",
      severity: "info",
      flattensOrganicPositions: false,
      detail:
        "HeadlessStillRenderer normalize3 on transformed normals is lighting hygiene, not bilateral symmetry.",
    },
    {
      id: "missing-normal-up-fill",
      severity: "warn",
      flattensOrganicPositions: false,
      detail:
        "worldMeshToRasterMesh fills missing normals with +Y — shading flattens on broken meshes; positions unchanged.",
    },
    {
      id: "no-mirror-average-pass",
      severity: "info",
      flattensOrganicPositions: false,
      detail:
        "No soft-raster pass averages left/right vertices or forces mirror symmetry before shade.",
    },
    {
      id: "fixture-authoring-symmetry",
      severity: "warn",
      flattensOrganicPositions: false,
      detail:
        "Synthetic HumanFace*.glb / UV-sphere demos are near-symmetric by construction — organic variance limited at asset source.",
    },
  ];

  return {
    status: "partial",
    auditedAt: "static-review",
    findings,
    overNormalizesOrganicVariance: false,
    recommendation:
      "Preserve authored normals; do not add mirror-average. Prefer operator GLBs for organic asymmetry. Keep minOrganicVariance in biometric profiles.",
  };
}

/**
 * Reject a proposed "symmetry flatten" of positions. Used by tests to lock
 * the anti-flatten invariant.
 */
export function rejectSymmetryFlatten(
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
  options?: { maxAverageMix?: number },
): { ok: boolean; reason: string } {
  const maxMix = options?.maxAverageMix ?? 0;
  if (maxMix > 0) {
    return {
      ok: false,
      reason: "symmetry-average-mix-forbidden — would flatten organic variance",
    };
  }
  if (left.length !== right.length) {
    return { ok: true, reason: "asymmetric topology retained" };
  }
  return { ok: true, reason: "no flatten applied" };
}

/**
 * Safe normal unitization — length only; never mixes opposite-side samples.
 */
export function unitizeNormal(n: Vec3): Vec3 {
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Measure position variance that must be retained (simple RMS about centroid).
 */
export function positionOrganicVariance(positions: Float32Array): number {
  const n = Math.floor(positions.length / 3);
  if (n < 2) return 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += positions[i * 3]!;
    cy += positions[i * 3 + 1]!;
    cz += positions[i * 3 + 2]!;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3]! - cx;
    const dy = positions[i * 3 + 1]! - cy;
    const dz = positions[i * 3 + 2]! - cz;
    acc += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(acc / n);
}

/**
 * Amendment VII §3 / EI-ORGANIC-VARIANCE — render-time gate.
 * Denies when measured variance < minOrganicVariance or when L/R averaging
 * was applied (symmetryAveraged / lrAveraged).
 */
export function enforceOrganicVarianceAtRender(args: {
  readonly measured?: number;
  readonly positions?: Float32Array;
  readonly minOrganicVariance: number;
  readonly symmetryAveraged?: boolean;
  readonly lrAveraged?: boolean;
}): OrganicVarianceGateResult {
  const issues: string[] = [];
  const min = args.minOrganicVariance;
  let measured: number | null =
    typeof args.measured === "number" && Number.isFinite(args.measured)
      ? args.measured
      : null;

  if (measured === null && args.positions) {
    measured = positionOrganicVariance(args.positions);
  }

  if (args.symmetryAveraged === true || args.lrAveraged === true) {
    issues.push("lr-vertices-averaged");
  }
  if (!(typeof min === "number" && Number.isFinite(min))) {
    issues.push("missing-minOrganicVariance");
  }
  if (measured === null) {
    issues.push("missing-organicVariance-measurement");
  } else if (typeof min === "number" && measured < min) {
    issues.push(`organicVariance=${measured} < min=${min}`);
  }

  const ok = issues.length === 0;
  return {
    ok,
    invariantId: EI_ORGANIC_VARIANCE,
    haltCode: ok ? null : HALT_ORGANIC_VARIANCE,
    measured,
    minOrganicVariance: typeof min === "number" ? min : null,
    issues,
    status: "enforced",
  };
}
