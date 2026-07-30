/**
 * Honest completeness scoring for PEP / SPR / CEC.
 * STATUS: **partial** — scores Partial until substantive fields filled.
 * NEVER auto-promotes to Full Photoreal (Drive-G-1).
 */

/** @param {unknown} v */
export function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    if (s.startsWith("<") && s.endsWith(">")) return false;
    if (s.includes("<uuid>") || s.includes("<hash>") || s.includes("<path")) {
      return false;
    }
    return true;
  }
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return false;
}

/**
 * Fraction of paths that are filled.
 * @param {object} obj
 * @param {string[]} paths dot-paths; arrays use `.0.` for first element presence
 */
export function scorePaths(obj, paths) {
  if (!paths.length) return 0;
  let hit = 0;
  for (const path of paths) {
    if (isFilled(getPath(obj, path))) hit += 1;
  }
  return hit / paths.length;
}

/** @param {object} obj @param {string} path */
export function getPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (p === "*") {
      if (!Array.isArray(cur) || cur.length === 0) return undefined;
      cur = cur[0];
      continue;
    }
    cur = cur[p];
  }
  return cur;
}

const SPR_PATHS = [
  "sceneIdentityBlock.sceneUUID",
  "sceneIdentityBlock.glbHash",
  "sceneIdentityBlock.glbProvenanceChain",
  "sceneIdentityBlock.creationTimestamp",
  "assetProvenanceLedger",
  "geometryProvenance",
  "geometryProvenance.*.vertexCount",
  "geometryProvenance.*.normalIntegrity",
  "geometryProvenance.*.uvIntegrity",
  "materialProvenance",
  "materialProvenance.*.shaderGraphSource",
  "materialProvenance.*.textureSources",
  "lightingProvenance",
  "lightingProvenance.*.hdrSource",
  "cameraProvenance.cameraId",
  "cameraProvenance.exposureLineage",
  "environmentProvenance.hash",
  "environmentProvenance.hdrSource",
  "constitutionalHooks.governanceTrail",
  "constitutionalHooks.evidenceCompletenessScore",
];

const PEP_PATHS = [
  "authorityRecord.renderer.name",
  "authorityRecord.renderer.device",
  "authorityRecord.renderer.version",
  "authorityRecord.renderer.executionMode",
  "authorityRecord.sceneIdentityHash",
  "authorityRecord.constitutionalRuntime.executionHash",
  "materialFidelityProof",
  "materialFidelityProof.*.shaderGraphHash",
  "materialFidelityProof.*.bsdfJustification.model",
  "materialFidelityProof.*.bsdfJustification.energyConservation",
  "materialFidelityProof.*.textureProvenance",
  "lightingJustificationRecord",
  "lightingJustificationRecord.*.intensityJustification",
  "lightingJustificationRecord.*.shadowPlausibility",
  "lightingJustificationRecord.*.globalIlluminationContribution",
  "lightingJustificationRecord.*.colorTemperature",
  "geometryTopologyEvidence.meshCount",
  "geometryTopologyEvidence.meshes",
  "geometryTopologyEvidence.meshes.*.vertexCount",
  "geometryTopologyEvidence.meshes.*.normalIntegrity",
  "cameraExposureEvidence.cameraId",
  "cameraExposureEvidence.fov",
  "cameraExposureEvidence.exposure",
  "cameraExposureEvidence.sensorModel",
  "physicalPlausibilityLedger.energyConservation",
  "physicalPlausibilityLedger.lightTransport",
  "physicalPlausibilityLedger.materialReflectanceBounds",
  "replayDeterminismRecord.seed",
  "replayDeterminismRecord.samples",
  "replayDeterminismRecord.deterministicHash",
  "beautyArtifact.sha256",
  "auditHooks.governanceTrail",
  "auditHooks.evidenceCompletenessScore",
];

/**
 * Treat placeholder lineages ("undeclared") as unfilled for honesty.
 * @param {unknown} v
 */
function isSubstantivelyFilled(v) {
  if (!isFilled(v)) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "undeclared") return false;
    if (s.includes("undeclared")) return false;
    if (s.includes("count-only") || s.includes("count from glb")) return false;
  }
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/**
 * @param {object} spr
 * @returns {{ score: number, level: 'none'|'partial'|'full', gaps: string[] }}
 */
export function scoreSprCompleteness(spr) {
  const gaps = [];
  let hit = 0;
  for (const path of SPR_PATHS) {
    if (isSubstantivelyFilled(getPath(spr, path))) hit += 1;
    else gaps.push(path);
  }
  const score = round4(hit / SPR_PATHS.length);
  // Auto-emit never reports level full — Full requires force elevation elsewhere.
  const level = score >= 0.95 ? "partial" : levelFromScore(score);
  return { score, level, gaps };
}

/**
 * @param {object} pep
 */
export function scorePepCompleteness(pep) {
  const gaps = [];
  let hit = 0;
  for (const path of PEP_PATHS) {
    if (isSubstantivelyFilled(getPath(pep, path))) hit += 1;
    else gaps.push(path);
  }
  const score = round4(hit / PEP_PATHS.length);
  const level = score >= 0.95 ? "partial" : levelFromScore(score);
  return { score, level, gaps };
}

/**
 * Full Photoreal eligibility — Phase 2 always false from auto-emit.
 * @param {number} pepScore
 * @param {number} sprScore
 * @param {{ forceFull?: boolean }} [opts]
 */
export function evaluateFullPhotorealEligibility(pepScore, sprScore, opts = {}) {
  // Constitutional: never auto-promote. Human/ESFR may set forceFull later.
  if (opts.forceFull === true) {
    return pepScore >= 0.95 && sprScore >= 0.95;
  }
  return false;
}

/**
 * @param {number} pepScore
 * @param {number} sprScore
 * @param {{ beautyPixels?: boolean, trailPresent?: boolean }} ctx
 */
export function promotionEligibilityFromScores(pepScore, sprScore, ctx = {}) {
  if (!ctx.beautyPixels && pepScore < 0.2) return "HOLD";
  if (pepScore >= 0.95 && sprScore >= 0.95 && ctx.forceFull) return "PROMOTE";
  if (ctx.beautyPixels || pepScore >= 0.35 || sprScore >= 0.35) {
    return "PROMOTE_WITH_GAPS";
  }
  return "HOLD";
}

/** @param {number} score */
export function levelFromScore(score) {
  if (score >= 0.95) return "full";
  if (score >= 0.2) return "partial";
  return "none";
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
