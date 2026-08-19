/**
 * Constitutional Core - Authority -> Validation -> Decision chain.
 * Status: canonical
 */

import { sha256Hex, stableStringify } from "../core/hash.js";

const FIXED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function numericHash(value) {
  return parseInt(sha256Hex(stableStringify(value)).slice(0, 12), 16) % 100000000;
}

export class AuthorityRegistry {
  constructor() {
    this.authorities = new Map([
      ["render", { level: "high", scope: "render", constraints: {} }],
      ["compute", { level: "high", scope: "compute", constraints: {} }],
      ["memory", { level: "medium", scope: "memory", constraints: {} }],
      ["default", { level: "basic", scope: "default", constraints: {} }],
    ]);
  }

  register(domain, authority) {
    this.authorities.set(domain, authority);
    return this;
  }

  get(domain) {
    return this.authorities.get(domain) || this.authorities.get("default");
  }

  has(domain) {
    return this.authorities.has(domain);
  }
}

export class IntentValidator {
  validate(intent) {
    const i = intent || {};
    return {
      valid: true,
      domain: i.domain || "default",
      purpose: i.purpose || "unspecified",
      justification: i.justification || "",
    };
  }
}

export class DecisionEngine {
  decide({ authorityOk, constraints }) {
    if (!authorityOk) return "conditional";
    if (constraints && Object.keys(constraints).length > 0) return "conditional";
    return "authorize";
  }
}

export class EvidenceContract {
  requirementsFor(actionType, domain) {
    const type = actionType === "render_4d_tesseract" ? "render_proof" : "execution_proof";
    return {
      required: true,
      type,
      anchor: "ledger",
      domain: domain || "default",
      fields: ["intentId", "worldId", "timelineId", "timeSeconds", "parameters"],
    };
  }
}

export class ContinuityLedger {
  constructor() {
    this.entries = [];
  }

  get index() {
    return this.entries.length;
  }

  anchorFor(content) {
    return numericHash(content);
  }

  append(entry) {
    this.entries.push(entry);
    return this.entries.length - 1;
  }
}

export class AuthorityTokenGenerator {
  generate(seed) {
    return "auth_" + sha256Hex(stableStringify(seed || {})).slice(0, 16);
  }
}

export class ConstitutionalCore {
  constructor() {
    this.authorityRegistry = new AuthorityRegistry();
    this.intentValidator = new IntentValidator();
    this.decisionEngine = new DecisionEngine();
    this.evidenceContract = new EvidenceContract();
    this.continuityLedger = new ContinuityLedger();
    this.authorityTokenGenerator = new AuthorityTokenGenerator();
  }

  decide(input = {}) {
    const intent = input.intent || input.intentContract || {};
    const proposedCommand = input.proposedCommand || input.command || {};
    const stateSnapshot = input.stateSnapshot || {};

    const intentId = input.intentId || intent.intentId || "intent.default";
    const worldId = input.worldId || (intent.parameters && intent.parameters.worldId) || "world.default";
    const timelineId = input.timelineId || (intent.parameters && intent.parameters.timelineId) || "timeline.default";
    const timeSeconds = input.timeSeconds ?? intent.timeSeconds ?? 0;
    const parameters = input.parameters || intent.parameters || {};

    const domain = proposedCommand.domain || input.domain || intent.domain || "default";
    const actionType = proposedCommand.type || proposedCommand.action || input.action || "default";

    const intentValidation = this.intentValidator.validate(intent);
    const authority = this.authorityRegistry.get(domain);

    const scopeMismatch =
      intent.domain !== undefined && proposedCommand.domain !== undefined && intent.domain !== proposedCommand.domain;
    const authorityOk = authority && authority.scope === domain;

    const constraints = authority && authority.constraints ? authority.constraints : {};

    let decision;
    if (scopeMismatch || !authorityOk) {
      decision = "conditional";
    } else {
      decision = this.decisionEngine.decide({ authorityOk, constraints });
    }

    const evidenceRequirements = this.evidenceContract.requirementsFor(actionType, domain);
    const authorityToken = this.authorityTokenGenerator.generate({ intentId, domain, actionType });
    const continuityIndex = this.continuityLedger.anchorFor({ intentId, domain, actionType, evidenceRequirements });
    const continuityAnchor = { index: continuityIndex, timestamp: FIXED_TIMESTAMP, type: "constitutional" };

    this.continuityLedger.append({ intentId, domain, decision, actionType });

    return {
      decision,
      authorityToken,
      evidenceRequirements,
      continuityAnchor,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      parameters,
      domain,
      actionType,
      authority,
      intentValidation,
    };
  }
}
