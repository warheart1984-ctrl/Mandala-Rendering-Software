/**
 * CEC v1.0 emitter — Constitutional Evidence Contract binding PEP+SPR+RDC+audit.
 * STATUS: **partial** — fullPhotorealEligible always false from auto-emit.
 */

import { randomUUID } from "node:crypto";
import {
  evaluateFullPhotorealEligibility,
  promotionEligibilityFromScores,
} from "./completeness.js";

/**
 * @param {object} opts
 * @returns {{ cec: object }}
 */
export function emitCec(opts = {}) {
  const pep = opts.pep;
  const spr = opts.spr;
  if (!pep || !spr) {
    throw new Error("emitCec requires pep and spr objects");
  }

  const pepScore =
    opts.pepCompleteness ??
    pep.auditHooks?.evidenceCompletenessScore ??
    pep.completeness?.score ??
    0;
  const sprScore =
    opts.sprCompleteness ??
    spr.constitutionalHooks?.evidenceCompletenessScore ??
    spr.completeness?.score ??
    0;

  const rdcHash = pep.replayDeterminismRecord?.deterministicHash || null;
  const trailPath =
    opts.governanceTrail ||
    pep.auditHooks?.governanceTrail ||
    spr.constitutionalHooks?.governanceTrail ||
    null;
  const esfr =
    opts.esfrHook ||
    pep.auditHooks?.esfrHook ||
    spr.constitutionalHooks?.esfrHook ||
    null;
  const inspector =
    opts.inspectorHook ||
    pep.auditHooks?.inspectorHook ||
    spr.constitutionalHooks?.inspectorHook ||
    null;

  const beautyPixels = !!(
    pep.beautyArtifact?.pixelsProduced && pep.beautyArtifact?.sha256
  );
  const determinismVerification = !!(
    rdcHash &&
    pep.replayDeterminismRecord?.seed != null &&
    pep.replayDeterminismRecord?.samples != null
  );
  const auditReadiness = !!(trailPath && esfr && inspector);

  const fullEligible = evaluateFullPhotorealEligibility(pepScore, sprScore, {
    forceFull: false,
  });
  const promotionEligibility = promotionEligibilityFromScores(
    pepScore,
    sprScore,
    { beautyPixels, trailPresent: !!trailPath },
  );

  const cec = {
    "@context": "https://sovereign-x.org/ciems/cec-v1",
    artifact: "ConstitutionalEvidenceContract",
    version: "1.0",
    id:
      opts.id ||
      `cec-${(pep.id || randomUUID()).replace(/^pep-/, "").slice(0, 16)}`,
    timestamp: opts.timestamp || new Date().toISOString(),
    status: "partial",
    photorealClaimLevel: fullEligible ? "full" : "partial",
    bindings: {
      pep: pep.id,
      spr: spr.id,
      replayDeterminismRecord: rdcHash,
      auditHooks: {
        esfr,
        inspector,
      },
      governanceTrail: trailPath,
      pepPath: opts.pepPath || null,
      sprPath: opts.sprPath || null,
    },
    invariants: {
      noPhotorealClaimWithoutEvidence: true,
      evidenceMustBeReplayable: true,
      evidenceMustBeAuditable: true,
      sceneProvenanceMustBeComplete: true,
      determinismMustBeHashVerified: true,
    },
    verification: {
      pepCompleteness: pepScore,
      sprCompleteness: sprScore,
      determinismVerification,
      auditReadiness,
      promotionEligibility,
      fullPhotorealEligible: false,
      note:
        "Phase 2: fullPhotorealEligible forced false — do not auto-promote to Full Photoreal",
    },
  };

  return { cec };
}
