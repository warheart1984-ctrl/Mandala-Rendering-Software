/**
 * FMCE - Federated Mandala Constitutional Engine.
 * Status: canonical
 *
 * Boot sequence: intentId, worldId, timelineId, timeSeconds, parameters, status: partial.
 * Constitutional flow: PILOT -> CPP -> ConstitutionalCore -> V12 -> EvidenceChain ->
 * ReplayEngine -> RT4D -> MandalaLattice -> PILOT.
 */

import { ConstitutionalCore } from "../constitutional/ConstitutionalCore.js";
import { V12 } from "../v12/V12.js";
import { EvidenceChain } from "../evidence/EvidenceChain.js";
import { ReplayEngine } from "../replay/ReplayEngine.js";
import { MandalaLattice } from "../mandala/MandalaLattice.js";
import { RT4D } from "../rt4d/RT4D.js";
import { CommandProposalProtocol } from "../cpp/CommandProposalProtocol.js";
import { PILOT } from "../pilot/PILOT.js";
import { sha256Hex } from "./hash.js";

const PROTECTED_PATHS = ["/constitution", "/engine/constitution", "/policies", "AGENTS.md"];
const FIXED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export class FMCEState {
  constructor() {
    this.intentId = "intent.boot";
    this.worldId = "world.boot";
    this.timelineId = "timeline.boot";
    this.timeSeconds = 0;
    this.parameters = {};
    this.status = "partial";
  }
}

export class FMCEValidator {
  constructor(fmce) {
    this.fmce = fmce || new FMCE();
  }

  validate(input) {
    return this.fmce.validate(input);
  }
}

export class FMCE {
  constructor() {
    this.constitutionalCore = new ConstitutionalCore();
    this.v12 = new V12();
    this.evidenceChain = new EvidenceChain();
    this.replayEngine = new ReplayEngine();
    this.mandalaLattice = new MandalaLattice();
    this.rt4d = new RT4D();
    this.cpp = new CommandProposalProtocol();
    this.pilot = new PILOT();
    this.continuityChain = [];
    this.mandalaPerception = null;
    this.state = new FMCEState();
  }

  validate(input = {}) {
    const pilotProposal = input.pilotProposal || input.proposedCommand || {};
    const stateSnapshot = input.stateSnapshot || {};

    if (PROTECTED_PATHS.includes(stateSnapshot.path)) {
      return { validatedCommand: null, protected: true, path: stateSnapshot.path };
    }

    const intentId = pilotProposal.intentId || "intent.default";
    const worldId = pilotProposal.worldId || "world.default";
    const timelineId = pilotProposal.timelineId || "timeline.default";
    const timeSeconds = pilotProposal.timeSeconds ?? 0;
    const parameters = pilotProposal.parameters || {};
    const domain = pilotProposal.domain || "render";

    const intent = {
      intentId,
      domain,
      purpose: "render",
      justification: "fmce validate",
      expectedOutcome: { output: "frame" },
      continuityRequirements: {},
      parameters: { worldId, timelineId, ...parameters },
    };

    const constitutional = this.constitutionalCore.decide({
      intent,
      proposedCommand: pilotProposal,
      stateSnapshot,
    });

    const v12Result = this.v12.execute({ intent, stateSnapshot });

    this.evidenceChain.addEvidence({
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
    });

    const replayResult = this.replayEngine.replay({
      outputHash: (v12Result.evidenceArtifact && v12Result.evidenceArtifact.commandHash) || v12Result.replayLog.anchor,
      stateDelta: v12Result.stateDelta,
      continuityProof: input.continuityProof || {},
    });

    const seed = parseInt(sha256Hex(intentId).slice(0, 8), 16);
    const rt4dResult = this.rt4d.render({
      seed,
      resolution: { width: 32, height: 32 },
      samplesPerPixel: parameters.samplesPerPixel ?? 1,
      maxDepth: parameters.maxDepth ?? 4,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
    });

    const mandalaPerception = this.mandalaLattice.integrate({
      state: stateSnapshot,
      evidence: { intentId, worldId, timelineId, timeSeconds, parameters },
      replay: { anchor: v12Result.replayLog.anchor },
      rt4d: { temporalGeometry: "continuous" },
      domainSignatures: input.domainSignatures || { domain },
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
    });
    this.mandalaPerception = mandalaPerception;

    this.continuityChain.push({
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
      domain,
      validatedAt: FIXED_TIMESTAMP,
    });

    return {
      validatedCommand: pilotProposal,
      authorityToken: constitutional.authorityToken,
      executionContract: {
        intentId,
        domain,
        actionType: constitutional.actionType,
        evidenceRequirements: constitutional.evidenceRequirements,
        continuityAnchor: constitutional.continuityAnchor,
        determinismClass: v12Result.finalDeterminismClass,
      },
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
      decision: constitutional.decision,
      v12Result,
      replayResult,
      rt4dResult,
      mandalaPerception,
    };
  }

  getContinuityChain() {
    return this.continuityChain;
  }

  getMandalaPerception() {
    return this.mandalaPerception;
  }
}
