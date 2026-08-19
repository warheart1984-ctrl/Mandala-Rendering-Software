/**
 * FMCE governance wrapper for the SME e2e demo.
 * Status: canonical
 *
 * Every modality artifact (GEN / VIS / TXT / AUD) is routed through the
 * FMCE constitutional chain (PILOT -> CPP -> ConstitutionalCore -> V12 ->
 * EvidenceChain -> ReplayEngine -> RT4D -> MandalaLattice -> PILOT). No
 * artifact may be produced without a governed FMCE decision + evidence entry.
 */

import { FMCE } from "../core/FMCE.js";

const FIXED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function buildProposal({ stage, modality, artifact, intentId, worldId, timelineId, timeSeconds, seed, domain }) {
  return {
    intentId,
    worldId,
    timelineId,
    timeSeconds,
    domain: domain || "compute",
    type: `sme_${stage}`,
    parameters: {
      stage,
      modality,
      seed,
      evidenceId: artifact.evidenceId,
      artifactChecksum: artifact.checksum,
      modelVersion: artifact.modelVersion,
      subStage: artifact.subStage,
    },
  };
}

/**
 * Route one modality artifact through FMCE.validate and record governance.
 */
export function govern(fmce, { stage, modality, artifact, intentId, worldId, timelineId, timeSeconds, seed, domain }) {
  const proposal = buildProposal({
    stage,
    modality,
    artifact,
    intentId,
    worldId,
    timelineId,
    timeSeconds,
    seed,
    domain,
  });

  const stateSnapshot = {
    path: `/sme/${stage}`,
    stage,
    modality,
    status: "partial",
    seed,
  };

  const result = fmce.validate({
    pilotProposal: proposal,
    stateSnapshot,
    domainSignatures: { domain: domain || "compute", stage, modality },
    continuityProof: {},
  });

  return {
    stage,
    modality,
    decision: result.decision,
    authorityToken: result.authorityToken,
    executionContract: result.executionContract,
    v12Result: {
      finalDeterminismClass: result.v12Result.finalDeterminismClass,
      finalStatus: result.v12Result.finalStatus,
      replayAnchor: result.v12Result.replayLog.anchor,
    },
    replayResult: result.replayResult,
    mandalaPerception: {
      continuityStatus: result.mandalaPerception.continuityStatus,
      pilotControl: result.mandalaPerception.pilotControl,
    },
    evidence: { evidenceId: artifact.evidenceId, checksum: artifact.checksum },
    validatedAt: FIXED_TIMESTAMP,
  };
}

export { FIXED_TIMESTAMP };

export function createFMCE() {
  return new FMCE();
}
