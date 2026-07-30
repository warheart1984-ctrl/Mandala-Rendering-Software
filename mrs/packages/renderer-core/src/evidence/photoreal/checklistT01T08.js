/**
 * Photoreal promotion checklist T-01..T-13.
 * Reports pass / partial / fail honestly — never fakes Full.
 * STATUS: **partial**
 */

import { isFilled } from "./completeness.js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {{ pep: object, spr: object, cec: object, runDir?: string }} bundle
 * @returns {{ tests: object[], summary: object }}
 */
export function runPhotorealPromotionChecklist(bundle) {
  const { pep, spr, cec } = bundle;
  const tests = [];
  const runDir = bundle.runDir ? resolve(bundle.runDir) : null;
  const verificationTrail = runDir
    ? readJson(join(runDir, "verification-trail.json"))
    : null;
  const lemonadePixels =
    verificationTrail?.lemonade?.pixelsProduced === true ||
    verificationTrail?.beautyProvider?.selected === "lemonade" &&
      verificationTrail?.beautyProvider?.pixelsProduced === true;

  const push = (id, name, result, detail) => {
    tests.push({ id, name, result, detail });
  };

  // T-01 Scene provenance completeness
  const sprScore = spr?.constitutionalHooks?.evidenceCompletenessScore ?? 0;
  const hasGlb = isFilled(spr?.sceneIdentityBlock?.glbHash);
  const sprGaps = spr?.completeness?.gaps?.length ?? 0;
  if (hasGlb && sprScore >= 0.95 && sprGaps === 0) {
    push("T-01", "Scene provenance completeness", "pass", `spr=${sprScore}`);
  } else if (hasGlb && sprScore >= 0.2) {
    push(
      "T-01",
      "Scene provenance completeness",
      "partial",
      `spr=${sprScore}; gaps remain (textures/topology/HDRI)`,
    );
  } else {
    push(
      "T-01",
      "Scene provenance completeness",
      "fail",
      `missing glb hash or score too low (spr=${sprScore})`,
    );
  }

  // T-02 Material fidelity integrity
  const mfp = pep?.materialFidelityProof || [];
  const mfpJustified = mfp.some(
    (m) => isFilled(m.shaderGraphHash) && isFilled(m.bsdfJustification?.model),
  );
  const mfpEnergy = mfp.some(
    (m) => typeof m.bsdfJustification?.energyConservation === "boolean",
  );
  if (mfp.length && mfpJustified && mfpEnergy) {
    push("T-02", "Material fidelity integrity", "pass", `entries=${mfp.length}`);
  } else if (mfp.length) {
    push(
      "T-02",
      "Material fidelity integrity",
      "partial",
      "materials present; energyConservation / full BSDF proof incomplete",
    );
  } else {
    push("T-02", "Material fidelity integrity", "fail", "no MFP entries");
  }

  // T-03 Lighting plausibility
  const ljc = pep?.lightingJustificationRecord || [];
  const ljcOk = ljc.some((l) => isFilled(l.intensityJustification));
  const ljcFull = ljc.some(
    (l) =>
      typeof l.shadowPlausibility === "number" &&
      typeof l.globalIlluminationContribution === "number",
  );
  if (ljc.length && ljcOk && ljcFull) {
    push("T-03", "Lighting plausibility", "pass", `entries=${ljc.length}`);
  } else if (ljc.length) {
    push(
      "T-03",
      "Lighting plausibility",
      "partial",
      "lights present; shadow/GI scores undeclared",
    );
  } else {
    push("T-03", "Lighting plausibility", "fail", "no LJC entries");
  }

  // T-04 Replay determinism
  const rdc = pep?.replayDeterminismRecord;
  if (
    rdc &&
    rdc.seed != null &&
    rdc.samples != null &&
    isFilled(rdc.deterministicHash)
  ) {
    push(
      "T-04",
      "Replay determinism",
      "partial",
      "params+hash present; dual-run byte identity not re-verified in this suite",
    );
  } else {
    push("T-04", "Replay determinism", "fail", "RDC incomplete");
  }

  // T-05 Evidence completeness — Full pass only if scores high AND photorealClaimLevel full
  const pepScore = pep?.auditHooks?.evidenceCompletenessScore ?? 0;
  const claim = pep?.photorealClaimLevel || "partial";
  if (pepScore >= 0.95 && sprScore >= 0.95 && claim === "full") {
    push(
      "T-05",
      "Evidence completeness",
      "pass",
      `pep=${pepScore} spr=${sprScore} claim=${claim}`,
    );
  } else if (pepScore >= 0.2 || sprScore >= 0.2) {
    push(
      "T-05",
      "Evidence completeness",
      "partial",
      `pep=${pepScore} spr=${sprScore} claim=${claim} — Partial, not Full`,
    );
  } else {
    push("T-05", "Evidence completeness", "fail", `pep=${pepScore} spr=${sprScore}`);
  }

  // T-06 Audit readiness
  const hooks =
    cec?.bindings?.auditHooks ||
    pep?.auditHooks ||
    {};
  const trail =
    cec?.bindings?.governanceTrail || pep?.auditHooks?.governanceTrail;
  if (hooks.esfr && hooks.inspector && trail) {
    push("T-06", "Audit readiness", "pass", "esfr+inspector+trail bound");
  } else if (trail || hooks.esfr || hooks.inspector) {
    push(
      "T-06",
      "Audit readiness",
      "partial",
      "some audit pointers present",
    );
  } else {
    push("T-06", "Audit readiness", "fail", "no audit hooks");
  }

  // T-07 Constitutional chain continuity
  const chainOk =
    cec?.bindings?.pep === pep?.id &&
    cec?.bindings?.spr === spr?.id &&
    isFilled(cec?.bindings?.replayDeterminismRecord);
  if (chainOk) {
    push(
      "T-07",
      "Constitutional chain continuity",
      "pass",
      "CEC binds pep+spr+rdc",
    );
  } else if (cec?.bindings?.pep && cec?.bindings?.spr) {
    push(
      "T-07",
      "Constitutional chain continuity",
      "partial",
      "pep/spr bound; rdc hash may be missing",
    );
  } else {
    push("T-07", "Constitutional chain continuity", "fail", "CEC bindings broken");
  }

  // T-08 Promotion eligibility — honest, never fake Full
  const elig = cec?.verification?.promotionEligibility || "NOT_EVALUATED";
  const fullElig = cec?.verification?.fullPhotorealEligible === true;
  if (elig === "PROMOTE" && fullElig) {
    push(
      "T-08",
      "Promotion eligibility",
      "pass",
      "PROMOTE + fullPhotorealEligible (manual elevation only)",
    );
  } else if (elig === "PROMOTE_WITH_GAPS" || elig === "HOLD") {
    push(
      "T-08",
      "Promotion eligibility",
      "partial",
      `${elig}; fullPhotorealEligible=${!!fullElig} (Phase 2 auto-emit keeps false)`,
    );
  } else if (elig === "REJECT") {
    push("T-08", "Promotion eligibility", "fail", "REJECT");
  } else {
    push(
      "T-08",
      "Promotion eligibility",
      "partial",
      `${elig}; not Full Photoreal`,
    );
  }

  // T-09 FPEC contract readiness (artifact-level gate)
  const hasScores =
    typeof pepScore === "number" && typeof sprScore === "number";
  if (hasScores && elig !== "NOT_EVALUATED") {
    push(
      "T-09",
      "FPEC contract readiness",
      "pass",
      `scores present pep=${pepScore} spr=${sprScore}; decision=${elig}`,
    );
  } else if (hasScores) {
    push(
      "T-09",
      "FPEC contract readiness",
      "partial",
      "scores present; promotion decision missing",
    );
  } else {
    push("T-09", "FPEC contract readiness", "fail", "missing completeness scores");
  }

  // T-10 CAT-PHR audit verdict readiness
  const auditTrailBound = isFilled(cec?.bindings?.governanceTrail);
  if (auditTrailBound && (tests.some((t) => t.result === "fail") || tests.some((t) => t.result === "partial"))) {
    push(
      "T-10",
      "CAT-PHR audit verdict readiness",
      "partial",
      "governance trail linked; unresolved checklist gaps imply PASS_WITH_GAPS",
    );
  } else if (auditTrailBound) {
    push("T-10", "CAT-PHR audit verdict readiness", "pass", "trail linked; no known checklist gaps");
  } else {
    push("T-10", "CAT-PHR audit verdict readiness", "fail", "governance trail missing");
  }

  // T-11 CPCS gate readiness
  const preGatePasses = tests.filter((t) => t.result === "pass").length;
  const replayHash = isFilled(pep?.replayDeterminismRecord?.deterministicHash);
  if (preGatePasses === 10 && replayHash && fullElig) {
    push(
      "T-11",
      "CPCS gate readiness",
      "pass",
      "all checklist gates pass with replay hash and full eligibility",
    );
  } else if (replayHash) {
    push(
      "T-11",
      "CPCS gate readiness",
      "partial",
      `pre-gate pass count=${preGatePasses}; fullPhotorealEligible=${fullElig}`,
    );
  } else {
    push("T-11", "CPCS gate readiness", "fail", "replay deterministic hash missing");
  }

  // T-12 Lemonade hold integrity
  if (lemonadePixels) {
    push(
      "T-12",
      "Lemonade hold integrity",
      "pass",
      "lemonade pixelsProduced:true evidence found",
    );
  } else {
    push(
      "T-12",
      "Lemonade hold integrity",
      "partial",
      "Lemonade remains held; no pixelsProduced:true evidence",
    );
  }

  // T-13 External PBR beauty artifact
  const beautyPath = pep?.beautyArtifact?.path;
  const beautySha = pep?.beautyArtifact?.sha256;
  if (isFilled(beautyPath) && isFilled(beautySha)) {
    push(
      "T-13",
      "External-PBR beauty artifact",
      "pass",
      "beauty artifact path and sha256 recorded",
    );
  } else if (isFilled(beautyPath)) {
    push(
      "T-13",
      "External-PBR beauty artifact",
      "partial",
      "beauty path present but hash missing",
    );
  } else {
    push(
      "T-13",
      "External-PBR beauty artifact",
      "fail",
      "beauty artifact missing",
    );
  }

  const counts = { pass: 0, partial: 0, fail: 0 };
  for (const t of tests) counts[t.result] = (counts[t.result] || 0) + 1;

  return {
    schema: "mrs.ciems.photoreal-checklist.v1",
    status: "partial",
    tests,
    summary: {
      ...counts,
      fullPhotoreal: false,
      note: "Checklist does not certify Full Photoreal; partial/held expected until all Phase-4 gates pass.",
    },
  };
}
