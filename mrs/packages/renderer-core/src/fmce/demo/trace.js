/**
 * Constitutional trace builder for the SME e2e demo.
 * Status: canonical
 *
 * Assembles the full CIEMS chain
 *   Authority -> Validation -> Decision -> Evidence -> Verification -> Replay -> Audit
 * from the governed FMCE stages, matching SME-SPEC Appendix C schema shape.
 */

import { sha256Hex } from "../core/hash.js";

const FIXED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function buildAuthority(actor, intentId, stages) {
  const allAuthorized = stages.every((s) => s.decision === "authorize");
  return {
    actor,
    contract: "contract.sme.v1.1",
    action: "multimodal.pipeline",
    granted: allAuthorized,
    policyResults: stages.map((s) => ({
      policyId: `policy-no-modality-without-governance`,
      modality: s.modality,
      decision: s.decision,
    })),
    intentId,
  };
}

function buildValidation(stages) {
  return {
    inputChecks: stages.map((s) => ({
      check: "sme_input_validation",
      modality: s.modality,
      result: "pass",
      evidenceId: s.evidence.evidenceId,
      checksum: s.evidence.checksum,
    })),
    resourceQuota: { cpuSeconds: 30, memoryBytes: 4294967296, granted: true },
  };
}

function buildDecision(stages, seed, intentId, goal) {
  const txtStage = stages.find((s) => s.modality === "text");
  return {
    model: "sme-txt-deterministic-v1.0.0",
    seed,
    goal,
    intentId,
    reasonTrace: txtStage ? txtStage.v12Result.finalDeterminismClass : "n/a",
    determinismClasses: stages.map((s) => ({ modality: s.modality, class: s.v12Result.finalDeterminismClass })),
    evidenceId: txtStage ? txtStage.evidence.evidenceId : null,
  };
}

function buildEvidence({ intentId, worldId, timelineId, artifacts, seed }) {
  const artifactList = artifacts.map((a) => ({
    type: a.modality,
    evidenceId: a.evidenceId,
    checksum: a.checksum,
    modelVersion: a.modelVersion,
  }));
  const rootHash = sha256Hex(
    artifactList.map((a) => `${a.evidenceId}:${a.checksum}`).sort().join("|")
  );
  return {
    bundleId: `bundle-${sha256Hex(`${intentId}:${seed}`).slice(0, 12)}`,
    worldId,
    timelineId,
    rootHash,
    artifacts: artifactList,
  };
}

function buildVerification(replayResult, v12Results) {
  const deterministic = replayResult.verified && v12Results.every((r) => r.finalStatus === "PASS");
  return {
    replayVerified: replayResult.verified,
    deterministic,
    replayEvidenceId: replayResult.replayEvidenceId,
    invariantChecks: replayResult.invariantChecks,
  };
}

function buildReplay(replayResult, seed, intentId) {
  return {
    requestId: `replay-${sha256Hex(`${intentId}:${seed}`).slice(0, 12)}`,
    target: "pipeline",
    result: replayResult.verified ? "match" : "diff",
    diff: replayResult.verified ? null : replayResult.diff,
    checks: replayResult.checks,
  };
}

function buildAudit() {
  return {
    recordId: `audit-${sha256Hex(`sme-${FIXED_TIMESTAMP}`).slice(0, 12)}`,
    timestamp: FIXED_TIMESTAMP,
    steward: "sme-audit-v1.0.0",
    immutable: true,
  };
}

/**
 * Build the full constitutional trace from pipeline results.
 */
export function buildConstitutionalTrace({
  intentId,
  worldId,
  timelineId,
  actor,
  goal,
  seed,
  stages,
  artifacts,
  fusion,
  replayResult,
}) {
  const traceId = `trace-${sha256Hex(`${intentId}:${seed}`).slice(0, 12)}`;
  return {
    intentId,
    traceId,
    worldId,
    timelineId,
    constitutionalTrace: {
      authority: buildAuthority(actor, intentId, stages),
      validation: buildValidation(stages),
      decision: buildDecision(stages, seed, intentId, goal),
      evidence: buildEvidence({ intentId, worldId, timelineId, artifacts, seed }),
      fusion,
      verification: buildVerification(replayResult, stages.map((s) => s.v12Result)),
      replay: buildReplay(replayResult, seed, intentId),
      audit: buildAudit(),
    },
  };
}
