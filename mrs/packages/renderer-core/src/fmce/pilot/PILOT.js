/**
 * PILOT - Perception, Interpretation, Planning, Navigation.
 * Status: canonical
 */

import { CommandProposalProtocol } from "../cpp/CommandProposalProtocol.js";
import { sha256Hex, stableStringify } from "../core/hash.js";

function numericHash(value) {
  return parseInt(sha256Hex(stableStringify(value)).slice(0, 12), 16) % 100000000;
}

export class PerceptionModule {}
export class StateInterpretationModule {}
export class PlanningModule {}
export class NavigationModule {}
export class AnomalyDetectionModule {}
export class CommandProposalModule {}
export class ExplanationModule {}

export class PILOT {
  constructor() {
    this.cpp = new CommandProposalProtocol();
    this.perceptionModule = new PerceptionModule();
    this.stateInterpretationModule = new StateInterpretationModule();
    this.planningModule = new PlanningModule();
    this.navigationModule = new NavigationModule();
    this.anomalyDetectionModule = new AnomalyDetectionModule();
    this.commandProposalModule = new CommandProposalModule();
    this.explanationModule = new ExplanationModule();
  }

  parseIntent(input = {}) {
    const rawInput = String(input.rawInput || "");
    const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
    const intent = tokens[0] || "";
    const parameters = {};
    let worldId;
    let timelineId;

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === "with") continue;
      const eq = token.indexOf("=");
      if (eq > 0) {
        const key = token.slice(0, eq);
        const value = token.slice(eq + 1);
        let parsedValue = value;
        if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = Number(value);
        if (key === "world") worldId = String(value);
        else if (key === "timeline") timelineId = String(value);
        else parameters[key] = parsedValue;
      }
    }

    return { intent, parameters, worldId, timelineId };
  }

  dispatch(input = {}, cpp) {
    const cppInstance = cpp || this.cpp;
    let parsed;
    let domain;

    if (input && typeof input === "object" && !input.rawInput && input.intent !== undefined) {
      const params = input.parameters || {};
      parsed = {
        intent: input.intent,
        parameters: params,
        worldId: params.worldId,
        timelineId: params.timelineId,
      };
      domain = input.domain || "default";
    } else {
      parsed = this.parseIntent(input);
      domain = (input && input.context && input.context.domain) || "default";
    }

    const intent = parsed.intent || "";
    const worldId = parsed.worldId || (parsed.parameters && parsed.parameters.worldId);
    const timelineId = parsed.timelineId || (parsed.parameters && parsed.parameters.timelineId);
    const parameters = parsed.parameters || {};

    const intentId = "intent_" + sha256Hex(stableStringify({ intent, worldId, timelineId, parameters, domain })).slice(0, 16);
    const authorityToken = "auth_" + sha256Hex(stableStringify({ intentId, intent, domain })).slice(0, 16);

    if (!intent || !worldId || !timelineId) {
      return {
        intentId,
        authorityToken,
        decision: "deny",
        reason: "missing required fields (intent, worldId, timelineId)",
        evidenceRequirements: { required: true, type: "execution_proof", anchor: "ledger" },
        continuityAnchor: { index: numericHash({ intentId }), type: "proposal" },
        determinismClass: "D2_NUMERICAL",
      };
    }

    const processed = cppInstance.process({
      intent: {
        intentId,
        domain,
        purpose: intent,
        justification: "pilot dispatch",
        expectedOutcome: {},
        continuityRequirements: {},
        parameters: { worldId, timelineId, ...parameters },
      },
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: intent || "render_4d_tesseract",
      action: intent,
      type: intent,
      command: { domain, type: intent, action: intent, intentId },
    });

    return {
      intentId,
      authorityToken,
      decision: processed.decision || "authorize",
      evidenceRequirements: processed.evidenceRequirements || { required: true, type: "execution_proof", anchor: "ledger" },
      continuityAnchor: processed.continuityAnchor || { index: numericHash({ intentId }), type: "proposal" },
      determinismClass: processed.determinismClass || "D2_NUMERICAL",
      proposal: processed,
      domain,
      intent,
    };
  }
}
