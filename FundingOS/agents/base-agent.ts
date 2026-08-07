/**
 * FundingOS Base Agent — Abstract base class for all 25 agents.
 */

import { CONTRACTS, resolveAuthority, getContract } from "../engine/constitution/contracts.js";
import { CHARTER } from "../engine/constitution/charter.js";
import { GovernanceKernel } from "../engine/governance/GovernanceKernel.js";
import { ConstitutionalKnowledgeLayer } from "../engine/governance/ConstitutionalKnowledgeLayer.js";
import { ConstitutionalStateEngine } from "../engine/governance/ConstitutionalStateEngine.js";
import { ProvenanceRecorder } from "../engine/governance/ProvenanceRecorder.js";
import { MRSCapabilities } from "../engine/mrs-crew/MRSCapabilities.js";
import { createMode } from "../modes/index";
import { getVendorSkillsLoader } from "../engine/skills/vendor-skills";
import type { VendorSkillsLoader } from "../engine/skills/vendor-skills";

export interface Intent {
  id: string;
  action: string;
  objective: string;
  params: Record<string, unknown>;
  evidence?: unknown[];
  timestamp: number;
}

export interface Context {
  actorId: string;
  contract: ReturnType<typeof getContract>;
  division: string;
  mode: string;
  deadline?: string;
  budgetValidated?: boolean;
  onSchedule?: boolean;
  auditTrailComplete?: boolean;
  performanceTracked?: boolean;
  worldId?: string;
  viaAdapter?: boolean;
}

export interface AgentResult {
  success: boolean;
  result?: unknown;
  evidence: {
    intent_declaration: unknown;
    agent_dispatch_log?: unknown;
    output_collection?: unknown;
    policy_validation?: unknown;
    approval_record?: unknown;
  };
  error?: string;
}

export interface GovernanceDecision {
  verdict: "allow" | "deny";
  code?: string;
  reason?: string;
  policiesApplied: string[];
  paramAdjust: Record<string, unknown> | null;
  attachProvenance: boolean;
  precedentCount: number;
}

export abstract class BaseAgent {
  protected contract: ReturnType<typeof getContract>;
  protected governanceKernel: GovernanceKernel;
  protected ckl: ConstitutionalKnowledgeLayer;
  protected cse: ConstitutionalStateEngine;
  protected provenance: ProvenanceRecorder;
  protected mrsCapabilities: MRSCapabilities;
  protected mode: ReturnType<typeof createMode>;
  protected skillsLoader: VendorSkillsLoader;

  constructor(
    protected actorId: string,
    protected division: string,
    modeName = "standard"
  ) {
    this.contract = getContract(actorId);
    if (!this.contract) {
      throw new Error(`No contract found for actor: ${actorId}`);
    }

    this.ckl = new ConstitutionalKnowledgeLayer();
    this.cse = new ConstitutionalStateEngine();
    this.provenance = new ProvenanceRecorder();
    this.governanceKernel = new GovernanceKernel(this.ckl, this.cse, this.provenance);

    this.mrsCapabilities = new MRSCapabilities();

    this.skillsLoader = getVendorSkillsLoader();
    this.mode = createMode(modeName, this.actorId, this.skillsLoader);

    this.provenance.startSession(`${this.actorId}-${Date.now()}`, {
      actorId: this.actorId,
      division: this.division,
      mode: modeName
    });
  }

  async execute(intent: Intent): Promise<AgentResult> {
    const intentDeclaration = this.createIntentDeclaration(intent);

    const auth = resolveAuthority(this.actorId, intent.action);
    if (!auth.ok) {
      return this.createErrorResult(intent, `Authority denied: ${auth.reason}`, intentDeclaration);
    }

    if (this.contract.forbiddenActions.includes(intent.action)) {
      return this.createErrorResult(intent, `Forbidden action: ${intent.action}`, intentDeclaration);
    }

    const context: Context = {
      actorId: this.actorId,
      contract: this.contract,
      division: this.division,
      mode: this.mode.name,
      viaAdapter: this.actorId.startsWith("mrs.")
    };

    const decision = await this.governanceKernel.evaluate(intent, context, intent.evidence || []);

    if (decision.verdict === "deny") {
      return this.createErrorResult(intent, decision.reason || "Policy denied", intentDeclaration, decision);
    }

    let result: unknown;
    try {
      result = await this.performAction(intent, context, decision);
    } catch (error) {
      return this.createErrorResult(intent, error instanceof Error ? error.message : String(error), intentDeclaration, decision);
    }

    const outputCollection = this.createOutputCollection(result);
    const policyValidation = this.createPolicyValidation(decision);
    const approvalRecord = this.createApprovalRecord(decision);

    this.provenance.record({
      intentId: intent.id,
      actorId: this.actorId,
      action: intent.action,
      result: "success",
      timestamp: Date.now()
    });

    this.provenance.stopSession();

    return {
      success: true,
      result,
      evidence: {
        intent_declaration: intentDeclaration,
        output_collection: outputCollection,
        policy_validation: policyValidation,
        approval_record: approvalRecord
      }
    };
  }

  protected abstract performAction(intent: Intent, context: Context, decision: GovernanceDecision): Promise<unknown>;

  protected createIntentDeclaration(intent: Intent) {
    return {
      id: `intent-decl-${intent.id}`,
      type: "intent_declaration",
      actorId: this.actorId,
      division: this.division,
      intent: {
        id: intent.id,
        action: intent.action,
        objective: intent.objective,
        params: intent.params
      },
      mode: this.mode.name,
      timestamp: Date.now()
    };
  }

  protected createOutputCollection(result: unknown) {
    return {
      id: `output-${Date.now()}`,
      type: "output_collection",
      actorId: this.actorId,
      result,
      timestamp: Date.now()
    };
  }

  protected createPolicyValidation(decision: GovernanceDecision) {
    return {
      id: `policy-val-${Date.now()}`,
      type: "policy_validation",
      actorId: this.actorId,
      verdict: decision.verdict,
      policiesApplied: decision.policiesApplied,
      paramAdjust: decision.paramAdjust,
      attachProvenance: decision.attachProvenance,
      timestamp: Date.now()
    };
  }

  protected createApprovalRecord(decision: GovernanceDecision) {
    return {
      id: `approval-${Date.now()}`,
      type: "approval_record",
      actorId: this.actorId,
      approved: decision.verdict === "allow",
      policiesApplied: decision.policiesApplied,
      timestamp: Date.now()
    };
  }

  protected createErrorResult(
    intent: Intent,
    error: string,
    intentDeclaration: unknown,
    decision?: GovernanceDecision
  ): AgentResult {
    this.provenance.stopSession();
    return {
      success: false,
      error,
      evidence: {
        intent_declaration: intentDeclaration,
        policy_validation: decision ? this.createPolicyValidation(decision) : null,
        approval_record: { approved: false, reason: error, timestamp: Date.now() }
      }
    };
  }

  async invokeMRS(capability: string, params: Record<string, unknown>) {
    if (!this.mode.mrsCrewAccess) {
      throw new Error("MRS crew access not available in current mode");
    }
    const caps = this.mrsCapabilities as unknown as Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
    return caps[capability](params);
  }

  async invokeMRSFullPipeline(params: Record<string, unknown>) {
    if (!this.mode.mrsCrewAccess) {
      throw new Error("MRS crew access not available in current mode");
    }
    return this.mrsCapabilities.fullProposalPipeline(params);
  }

  getAvailableSkills() {
    if (this.mode.vendorSkillsAccess === "all") {
      return this.skillsLoader.getAllSkills();
    }
    return [];
  }

  hasSkill(skillName: string) {
    if (this.mode.vendorSkillsAccess === "all") {
      return this.skillsLoader.hasSkill(skillName);
    }
    return false;
  }

  getActorId() { return this.actorId; }
  getDivision() { return this.division; }
  getContract() { return this.contract; }
  getMode() { return this.mode; }
  getProvenance() { return this.provenance; }
}