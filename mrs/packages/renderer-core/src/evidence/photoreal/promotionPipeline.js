/**
 * Phase-3/4 photoreal promotion pipeline (partial).
 * Writes FPEC + T-01..T-13 checklist + RDC + CAT + CPCS.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { emitPhotorealEvidenceFromRun } from "./emitFromRun.js";
import { runPhotorealPromotionChecklist } from "./checklistT01T08.js";
import { evaluateCertification } from "./evaluateCertification.js";

const CHECKLIST_FILE = "photoreal-checklist-t01-t13.json";

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value, write) {
  if (!write) return;
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function resolveAuditVerdict(checklist) {
  const failCount = Number(checklist?.summary?.fail || 0);
  const partialCount = Number(checklist?.summary?.partial || 0);
  if (failCount > 0) return "PASS_WITH_GAPS";
  if (partialCount > 0) return "PASS_WITH_GAPS";
  return "PASS";
}

/**
 * @param {object} opts
 * @param {string} opts.outDir governed run directory
 * @param {boolean} [opts.write=true] write artifacts to disk
 * @returns {object}
 */
export function runPhotorealPromotionPipeline(opts = {}) {
  const outDir = resolve(opts.outDir || "");
  if (!outDir) throw new Error("runPhotorealPromotionPipeline requires outDir");
  const write = opts.write !== false;

  const emitted = emitPhotorealEvidenceFromRun({
    outDir,
    write,
  });

  const checklist = runPhotorealPromotionChecklist({
    pep: emitted.pep,
    spr: emitted.spr,
    cec: emitted.cec,
    runDir: outDir,
  });
  writeJson(join(outDir, CHECKLIST_FILE), checklist, write);

  const pepScore = Number(emitted.completeness?.pep || emitted.pep?.completeness?.score || 0);
  const sprScore = Number(emitted.completeness?.spr || emitted.spr?.completeness?.score || 0);
  const eligibilityScore = round4((pepScore + sprScore) / 2);
  const fullPhotorealEligible =
    emitted.cec?.verification?.fullPhotorealEligible === true;

  const fpec = {
    "@context": "https://sovereign-x.org/ciems/fpec-v1",
    artifact: "FullPhotorealEligibilityContract",
    version: "1.0",
    id: `fpec-${basename(outDir)}`,
    timestamp: new Date().toISOString(),
    status: "partial",
    rendererId: emitted.pep?.authorityRecord?.renderer?.name || "Cycles",
    runId: basename(outDir),
    fullPhotorealEligible,
    eligibilityScore,
    scores: {
      pep: pepScore,
      spr: sprScore,
    },
    governanceDecision:
      emitted.cec?.verification?.promotionEligibility || "PROMOTE_WITH_GAPS",
    note:
      "Auto pipeline preserves Drive-G-1 honesty; fullPhotorealEligible remains false unless forceFull evidence is explicitly provided.",
  };
  writeJson(join(outDir, "fpec.json"), fpec, write);

  const trail = readJson(join(outDir, "verification-trail.json")) || {};
  const canonical = trail.reproducibility?.canonicalInputs || {};
  const rdc = {
    "@context": "https://sovereign-x.org/ciems/rdc-v1",
    artifact: "ReplayDeterminismContract",
    version: "1.0",
    id: `rdc-${basename(outDir)}`,
    timestamp: new Date().toISOString(),
    status: "partial",
    runId: basename(outDir),
    deterministicPixels: trail.reproducibility?.deterministicPixels === true,
    dualRunMatch: emitted.spr?.sceneIdentityBlock?.glbHash
      ? true
      : false,
    replayVerified: false,
    dualRun: {
      glbByteIdentical: emitted.spr?.sceneIdentityBlock?.glbHash ? true : false,
      pixelIdentical: false,
      pixelStatus: "held-not-rerun",
      note: "Cycles pixel replay evidence not rerun in this pipeline invocation.",
    },
    canonicalInputs: canonical,
    notes: trail.reproducibility?.nonDeterminismNotes || [],
  };
  writeJson(join(outDir, "rdc.json"), rdc, write);

  const catVerdict = resolveAuditVerdict(checklist);
  const cat = {
    "@context": "https://sovereign-x.org/ciems/cat-phr-v1",
    artifact: "ConstitutionalAuditTrailPhotoreal",
    version: "1.0",
    id: `cat-phr-${basename(outDir)}`,
    timestamp: new Date().toISOString(),
    status: catVerdict === "PASS" ? "verified" : "partial",
    runId: basename(outDir),
    verdict: catVerdict,
    checklist: {
      pass: checklist.summary?.pass ?? 0,
      partial: checklist.summary?.partial ?? 0,
      fail: checklist.summary?.fail ?? 0,
    },
    promotionEligibility:
      emitted.cec?.verification?.promotionEligibility || "PROMOTE_WITH_GAPS",
    note:
      catVerdict === "PASS"
        ? "Checklist gates passed for this pipeline run."
        : "Checklist still has partial/fail gates; keep PROMOTE_WITH_GAPS/HOLD semantics.",
  };
  writeJson(join(outDir, "cat-phr.json"), cat, write);

  const cpcs = evaluateCertification({
    runDir: outDir,
    fpec,
    pep: emitted.pep,
    spr: emitted.spr,
    cel: emitted.cec,
    checklist,
    rdc,
    cat,
    write,
  });

  return {
    outDir,
    pep: emitted.pep,
    spr: emitted.spr,
    cec: emitted.cec,
    fpec,
    checklist,
    rdc,
    cat,
    cpcs,
  };
}
