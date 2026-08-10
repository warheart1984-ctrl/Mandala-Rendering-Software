/**
 * CPP - Constitutional Command Proposal Protocol
 * Status: partial
 * Module: MODULE_9_CPP
 */

import { ConstitutionalCore } from "../constitutional/ConstitutionalCore.js";

export class CommandProposalProtocol {
  constructor() {
    this.intentBuilder = new IntentContractBuilder();
    this.packagingEngine = new ConstitutionalPackagingEngine();
    this.domainValidator = new DomainValidator();
    this.constraintValidator = new ConstraintValidator();
    this.authorityInterface = new AuthorityRequestInterface();
    this.executionHandoff = new ExecutionHandoffInterface();
    this.constitutionalCore = new ConstitutionalCore();
  }

  process(input) {
    const intentContract = this.intentBuilder.build(input.commandProposal);

    const domainValid = this.domainValidator.validate(
      (input.commandProposal && input.commandProposal.intent?.domain) || "default",
      input.commandProposal
    );

    if (!domainValid) {
      return {
        decision: "deny",
        authorityToken: null,
        executionContract: null,
        explanation: { reason: "Invalid domain", stage: "domain_validator" },
        intentId: input.intentId,
        worldId: input.worldId,
        timelineId: input.timelineId,
        timeSeconds: input.timeSeconds,
        parameters: input.parameters
      };
    }

    const constraintResult = this.constraintValidator.validate(
      input.commandProposal,
      input.stateModel
    );

    if (!constraintResult.valid) {
      return {
        decision: "conditional",
        authorityToken: null,
        executionContract: null,
        explanation: { reason: constraintResult.reason, stage: "constraint_validator" },
        intentId: input.intentId,
        worldId: input.worldId,
        timelineId: input.timelineId,
        timeSeconds: input.timeSeconds,
        parameters: input.parameters
      };
    }

    const packagedCommand = this.packagingEngine.wrap(input.commandProposal);

    const authorityRequest = {
      ...packagedCommand,
      intentContract,
      stateModel: input.stateModel,
      continuityProof: input.continuityProof,
      domainSignatures: input.domainSignatures,
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
    };

    const constitutionalResult = this.constitutionalCore.decide(authorityRequest);

    if (constitutionalResult.decision === "deny") {
      return {
        decision: "deny",
        authorityToken: null,
        executionContract: null,
        explanation: { reason: "Constitutional denial", stage: "constitutional_core" },
        intentId: input.intentId,
        worldId: input.worldId,
        timelineId: input.timelineId,
        timeSeconds: input.timeSeconds,
        parameters: input.parameters
      };
    }

    this.executionHandoff.handoff(
      constitutionalResult.authorityToken,
      constitutionalResult.evidenceRequirements
    );

    return {
      decision: constitutionalResult.decision,
      authorityToken: constitutionalResult.authorityToken,
      executionContract: {
        safetyProfile: {},
        domainSignature: "sig_" + Date.now(),
        authorityToken: constitutionalResult.authorityToken
      },
      explanation: {
        reason: "Authorized through full constitutional pipeline",
        stages: ["intent_builder", "domain_validator", "constraint_validator", "packaging_engine", "constitutional_core"],
        intentContract,
        evidenceRequirements: constitutionalResult.evidenceRequirements
      },
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
    };
  }
}

export class IntentContractBuilder {
  build(proposal) {
    const p = proposal;
    return {
      domain: p.intent?.domain || "default",
      purpose: p.intent?.purpose || "unspecified",
      justification: p.justification || "constitutional maintenance",
      expectedOutcome: p.expectedOutcome || {},
      continuityRequirements: { preserveChain: true }
    };
  }
}

export class ConstitutionalPackagingEngine {
  wrap(command) {
    const c = command;
    return {
      action: c.action,
      parameters: c.intent?.expectedOutcome || {},
      domain: c.intent?.domain || "default",
      constraints: {
        constitutional: true,
        continuity: true,
        evidence: true
      },
      metadata: {
        packagedAt: Date.now(),
        originalProposal: c
      }
    };
  }
}

export class DomainValidator {
  constructor() {
    this.validDomains = new Set(["render", "compute", "memory", "default", "replay"]);
  }

  validate(domain, command) {
    return this.validDomains.has(domain);
  }

  registerDomain(domain) {
    this.validDomains.add(domain);
  }
}

export class ConstraintValidator {
  validate(command, state) {
    const c = command;

    if (!c.intent?.justification) {
      return {
        valid: false, reason: "Missing constitutional justification"
      };
    }

    if (!c.intent?.expectedOutcome) {
      return {
        valid: false, reason: "Missing expected outcome for continuity"
      };
    }

    return { valid: true };
  }
}

export class AuthorityRequestInterface {
  request(packaged) {
    return packaged;
  }
}

export class ExecutionHandoffInterface {
  handoff(token, contract) {
    console.log("[ExecutionHandoff] Token:", token, "Contract:", contract);
  }
}