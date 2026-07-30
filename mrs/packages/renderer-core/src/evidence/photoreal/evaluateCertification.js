/**
 * CPCS v1.0 — Constitutional Photoreal Certification evaluator.
 * STATUS: **partial** — certified:true only when all Phase 4 gates pass.
 * Never auto-claims PHASE_4_FULL_PHOTOREAL.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const CPCS_THRESHOLDS = {
  pepCompleteness: 0.95,
  sprCompleteness: 1.0,
  checklistPassCount: 13,
};

/**
 * @param {object} opts
 * @param {string} [opts.runDir] load artifacts from disk
 * @param {object} [opts.fpec]
 * @param {object} [opts.pep]
 * @param {object} [opts.spr]
 * @param {object} [opts.cel]
 * @param {object} [opts.checklist]
 * @param {object} [opts.rdc]
 * @param {object} [opts.cat]
 * @param {boolean} [opts.write=true]
 * @returns {object} cpcs document
 */
export function evaluateCertification(opts = {}) {
  const runDir = opts.runDir ? resolve(opts.runDir) : null;
  const write = opts.write !== false;

  const fpec = opts.fpec || loadJson(runDir && join(runDir, "fpec.json"));
  const pep = opts.pep || loadJson(runDir && join(runDir, "pep.json"));
  const spr = opts.spr || loadJson(runDir && join(runDir, "spr.json"));
  const cel = opts.cel || loadJson(runDir && join(runDir, "cel.json"));
  const checklist =
    opts.checklist ||
    loadJson(runDir && join(runDir, "photoreal-checklist-t01-t13.json"));
  const rdc = opts.rdc || loadJson(runDir && join(runDir, "rdc.json"));
  const cat =
    opts.cat ||
    loadJson(runDir && join(runDir, "cat-phr.json")) ||
    {};

  if (!fpec || typeof fpec !== "object") {
    throw new Error("CPCS requires fpec.json (or opts.fpec)");
  }

  const pepCompleteness = resolvePepScore(pep, cel, fpec);
  const sprCompleteness = resolveSprScore(spr, cel, fpec);
  const checklistPassCount = countChecklistPasses(checklist);
  const { dualRunMatch, replayVerified } = resolveDreFlags(rdc);
  const dreVerified = dualRunMatch === true && replayVerified === true;
  const auditVerdict = cat.verdict || "UNKNOWN";
  const fullEligible = fpec.fullPhotorealEligible === true;

  const criteria = {
    fpecFullEligible: fullEligible,
    pepCompletenessGe095: pepCompleteness >= CPCS_THRESHOLDS.pepCompleteness,
    sprCompletenessExact1: sprCompleteness === CPCS_THRESHOLDS.sprCompleteness,
    checklistAllPass:
      checklistPassCount === CPCS_THRESHOLDS.checklistPassCount,
    dreDualRunMatch: dualRunMatch === true,
    dreReplayVerified: replayVerified === true,
    catPass: auditVerdict === "PASS",
  };

  const failedGates = Object.entries(criteria)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  const certified = failedGates.length === 0;

  const rendererId = resolveRendererId(pep, cel, fpec);
  const runId = resolveRunId(runDir, pep, cel);

  const cpcs = {
    "@context": "https://sovereign-x.org/ciems/cpcs-v1",
    artifact: "ConstitutionalPhotorealCertification",
    version: "1.0",
    id: `cpcs-${String(runId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`,
    timestamp: new Date().toISOString(),
    status: certified ? "verified" : "partial",
    rendererId,
    runId,
    certified,
    certificationLevel: certified ? "PHASE_4_FULL_PHOTOREAL" : "NONE",
    eligibilityScore:
      typeof fpec.eligibilityScore === "number" ? fpec.eligibilityScore : 0,
    pepCompleteness,
    sprCompleteness,
    checklistPassCount,
    dreVerified,
    auditVerdict,
    criteria,
    failedGates,
    note: certified
      ? "CPCS: all Phase 4 gates passed"
      : "CPCS: not certified - do not claim PHASE_4_FULL_PHOTOREAL",
  };

  if (write && runDir) {
    writeFileSync(join(runDir, "cpcs.json"), JSON.stringify(cpcs, null, 2));
  }

  return cpcs;
}

function loadJson(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolvePepScore(pep, cel, fpec) {
  if (typeof pep?.completeness?.score === "number") return pep.completeness.score;
  if (typeof pep?.auditHooks?.evidenceCompletenessScore === "number") {
    return pep.auditHooks.evidenceCompletenessScore;
  }
  const fromCel = celEntryCompleteness(cel, "pep");
  if (typeof fromCel === "number") return fromCel;
  if (typeof fpec?.scores?.pep === "number") return fpec.scores.pep;
  if (typeof cel?.completeness?.pep === "number") return cel.completeness.pep;
  return 0;
}

function resolveSprScore(spr, cel, fpec) {
  if (typeof spr?.completeness?.score === "number") return spr.completeness.score;
  if (typeof spr?.constitutionalHooks?.evidenceCompletenessScore === "number") {
    return spr.constitutionalHooks.evidenceCompletenessScore;
  }
  const fromCel = celEntryCompleteness(cel, "spr");
  if (typeof fromCel === "number") return fromCel;
  if (typeof fpec?.scores?.spr === "number") return fpec.scores.spr;
  if (typeof cel?.completeness?.spr === "number") return cel.completeness.spr;
  return 0;
}

function celEntryCompleteness(cel, kind) {
  const entry = (cel?.entries || []).find((e) => e.kind === kind);
  return typeof entry?.completeness === "number" ? entry.completeness : null;
}

function countChecklistPasses(checklist) {
  if (!checklist) return 0;
  if (typeof checklist.passCount === "number") return checklist.passCount;
  if (typeof checklist.summary?.pass === "number") return checklist.summary.pass;
  const tests = checklist.tests || [];
  return tests.filter(
    (t) => t.result === "pass" || t.status === "pass",
  ).length;
}

/**
 * Map RDC/DRE fields to CPCS dualRunMatch + replayVerified.
 * Pixel held-not-rerun does NOT count as replayVerified.
 */
function resolveDreFlags(rdc) {
  if (!rdc || typeof rdc !== "object") {
    return { dualRunMatch: false, replayVerified: false };
  }
  const dual = rdc.dualRun || {};
  const dualRunMatch =
    rdc.dualRunMatch === true ||
    dual.glbByteIdentical === true ||
    (dual.verified === true && dual.glbByteIdentical !== false);

  const replayVerified =
    rdc.replayVerified === true ||
    dual.pixelIdentical === true ||
    dual.pixelStatus === "pixel-identical";

  return {
    dualRunMatch: !!dualRunMatch,
    replayVerified: !!replayVerified,
  };
}

function resolveRendererId(pep, cel, fpec) {
  if (typeof cel?.rendererId === "string") return cel.rendererId;
  const name = pep?.authorityRecord?.renderer?.name;
  if (typeof name === "string" && name) return name;
  if (typeof fpec?.rendererId === "string") return fpec.rendererId;
  return "unknown";
}

function resolveRunId(runDir, pep, cel) {
  if (typeof cel?.runId === "string") return cel.runId;
  if (runDir) return basename(runDir);
  if (typeof pep?.id === "string") {
    return pep.id.replace(/^pep-/, "").slice(0, 16);
  }
  return "unknown";
}
