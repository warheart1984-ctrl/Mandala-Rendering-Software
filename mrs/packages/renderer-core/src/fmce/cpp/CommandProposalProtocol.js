/**
 * Command Proposal Protocol (CPP)
 * Status: canonical
 *
 * Validates proposals on: authority, capability, policy, evidence.
 * Produces deterministic proposals under replay.
 */

import { sha256Hex, stableStringify } from "../core/hash.js";

const KNOWN_AUTHORITY = "mandala-renderer";
const KNOWN_CAPABILITY = "gpu.compute.amd.legacy_efficient";
const KNOWN_POLICY = "render_4d_tesseract";
const VALID_DOMAINS = new Set(["render", "compute", "memory", "default"]);

function numericHash(value) {
  return parseInt(sha256Hex(stableStringify(value)).slice(0, 12), 16) % 100000000;
}

export class IntentContractBuilder {
  build(intent = {}) {
    return {
      intentId: intent.intentId || "intent.default",
      domain: intent.domain || "default",
      purpose: intent.purpose || "render",
      justification: intent.justification || "constitutional",
      expectedOutcome: intent.expectedOutcome || {},
      continuityRequirements: intent.continuityRequirements || {},
      parameters: intent.parameters || {},
    };
  }
}

export class ConstitutionalPackagingEngine {
  package(intentContract) {
    return {
      version: "1.0",
      contract: intentContract,
      seal: "sha256:" + sha256Hex(stableStringify(intentContract || {})),
    };
  }
}

export class DomainValidator {
  validate(domain) {
    const d = domain || "default";
    return { valid: VALID_DOMAINS.has(d), domain: d };
  }
}

export class ConstraintValidator {
  validate(command = {}) {
    if (command.action || command.type) {
      return { valid: true, constraints: [] };
    }
    return { valid: true, constraints: [] };
  }
}

export class AuthorityRequestInterface {
  request(authorityId, capability, policy) {
    return { authorityId, capability, policy };
  }
}

export class ExecutionHandoffInterface {
  handoff(proposal) {
    return { accepted: true, proposal };
  }
}

export class CommandProposalProtocol {
  constructor() {
    this.intentContractBuilder = new IntentContractBuilder();
    this.constitutionalPackagingEngine = new ConstitutionalPackagingEngine();
    this.domainValidator = new DomainValidator();
    this.constraintValidator = new ConstraintValidator();
    this.authorityRequestInterface = new AuthorityRequestInterface();
    this.executionHandoffInterface = new ExecutionHandoffInterface();
    this.authorityRegistry = {
      authorities: new Map([["mandala-renderer", { level: "high", scope: "render" }]]),
    };
  }

  process(input = {}) {
    const intent = input.intent || {};
    const intentId = intent.intentId || input.intentId || "intent.default";
    const domain = intent.domain || input.domain || "default";
    const action = intent.action || input.action || input.type || "default";
    const worldId = intent.worldId || input.worldId || (intent.parameters && intent.parameters.worldId) || "world.default";
    const timelineId =
      intent.timelineId || input.timelineId || (intent.parameters && intent.parameters.timelineId) || "timeline.default";
    const parameters = intent.parameters || input.parameters || {};

    const intentContract = this.intentContractBuilder.build(intent);
    const packagedContract = this.constitutionalPackagingEngine.package(intentContract);
    const constraintValidation = this.constraintValidator.validate({ action, type: action, ...(input.command || {}) });
    const domainValidation = this.domainValidator.validate(domain);

    const authorized = constraintValidation.valid && domainValidation.valid;
    const decision = authorized ? "authorize" : "deny";
    const authorityToken = "auth_" + sha256Hex(stableStringify({ intentId, domain, action })).slice(0, 16);

    return {
      decision,
      authorityToken,
      intentId,
      domain,
      action,
      worldId,
      timelineId,
      parameters,
      intentContract,
      packagedContract,
      constraintValidation,
      domainValidation,
      evidenceRequirements: { required: true, type: "render_proof", anchor: "ledger" },
      continuityAnchor: { index: numericHash({ intentId, domain, action }), type: "proposal" },
      determinismClass: "D2_NUMERICAL",
      authorityRegistry: this.authorityRegistry,
    };
  }

  validateProposal(proposal = {}) {
    const authorityOk = proposal.authorityId === KNOWN_AUTHORITY;
    const capabilityOk = proposal.capability === KNOWN_CAPABILITY;
    const policyOk = proposal.policy === KNOWN_POLICY;

    const ev = proposal.evidence;
    const evidenceOk = !!(
      ev &&
      ev.intentId !== undefined &&
      ev.worldId !== undefined &&
      ev.timelineId !== undefined &&
      ev.timeSeconds !== undefined &&
      ev.parameters !== undefined
    );

    const failures = [];
    if (!authorityOk) failures.push("authority: unknown or unauthorized authorityId");
    if (!capabilityOk) failures.push("capability: unknown or unauthorized capability");
    if (!policyOk) failures.push("policy: prohibited or unknown policy");
    if (!evidenceOk) failures.push("evidence: incomplete evidence bundle");

    const rejectionReason = failures.join("; ");
    const valid = failures.length === 0;

    return {
      valid,
      authorityOk,
      capabilityOk,
      policyOk,
      evidenceOk,
      rejectionReason,
      rejectionExplanation: valid ? "proposal is constitutionally valid" : rejectionReason,
    };
  }
}
