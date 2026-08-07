/**
 * FundingOS Constitutional Knowledge Layer — Policy evaluation engine.
 */

import policies from "./policies/default.policies.json";

export class ConstitutionalKnowledgeLayer {
  constructor(policySet = policies.default || policies) {
    this.policySet = policySet;
  }

  async evaluate(intent, context, evidence = []) {
    const results = [];
    let verdict = "allow";
    let paramAdjust = null;
    let attachProvenance = false;

    for (const policy of this.policySet) {
      if (!this.applies(policy, intent, context, evidence)) continue;

      const result = await this.applyPolicy(policy, intent, context, evidence);
      results.push(result);

      if (result.verdict === "deny" && (policy.severity === "critical" || policy.severity === "high")) {
        verdict = "deny";
      }
      if (result.paramAdjust) paramAdjust = result.paramAdjust;
      if (result.attachProvenance) attachProvenance = true;
    }

    return {
      verdict,
      policiesApplied: results.map(r => r.policyId),
      paramAdjust,
      attachProvenance,
      precedentCount: results.length
    };
  }

  applies(policy, intent, context, evidence = []) {
    // Simple condition evaluation - in production would be more sophisticated
    switch (policy.condition) {
      case "intent != null":
        return !!intent;
      case "actor_has_contract":
        return !!context.contract;
      case "director_has_valid_contract":
        return context.actorId === "mrs.director" && !!context.contract;
      case "director_action_not_forbidden":
        return context.actorId === "mrs.director" && !this.isForbiddenDirectorAction(intent.action);
      case "director_mcp_invocation":
        return context.actorId === "mrs.director" && intent.action?.startsWith("mcp.");
      case "funding_operation_with_rendering":
        return intent.action?.includes("render") && context.division !== "mrsCrew";
      case "funding_operation_with_narrative":
        return intent.action?.includes("narrative") && context.division !== "mrsCrew";
      case "mrs_crew_invoked_via_adapter":
        return context.actorId?.startsWith("mrs.") && context.viaAdapter === true;
      case "proposal_requires_eligibility":
        return intent.action === "write_narrative" && context.division === "preparation";
      case "submission_requires_compliance":
        return intent.action === "submit_application";
      case "deadline_not_passed":
        return context.deadline ? new Date(context.deadline) > new Date() : true;
      case "budget_validated":
        return context.budgetValidated === true;
      case "reporting_on_schedule":
        return context.onSchedule === true;
      case "audit_trail_complete":
        return context.auditTrailComplete === true;
      case "performance_tracked":
        return context.performanceTracked === true;
      case "require_evidence_for_mutation":
        return evidence.length > 0;
      default:
        return true;
    }
  }

  isForbiddenDirectorAction(action) {
    const forbidden = [
      "write_code", "generate_artifacts", "mutate_models",
      "interpret", "invoke_external", "execute_specialist_work",
      "mutate_artifacts_directly"
    ];
    return forbidden.includes(action);
  }

  async applyPolicy(policy, intent, context, evidence) {
    switch (policy.rule) {
      case "deny_if_false":
        const conditionMet = this.applies(policy, intent, context);
        if (!conditionMet) {
          return {
            policyId: policy.id,
            verdict: "deny",
            reason: policy.message,
            haltCode: policy.haltCode
          };
        }
        return { policyId: policy.id, verdict: "allow" };

      case "attach_provenance":
        return {
          policyId: policy.id,
          verdict: "allow",
          attachProvenance: true
        };

      case "modify_param":
        return {
          policyId: policy.id,
          verdict: "allow",
          paramAdjust: { [policy.param]: policy.modifier }
        };

      case "deny_if_missing_world":
        if (!context.worldId) {
          return { policyId: policy.id, verdict: "deny", reason: policy.message };
        }
        return { policyId: policy.id, verdict: "allow" };

      default:
        return { policyId: policy.id, verdict: "allow" };
    }
  }
}

export function createCKL(policySet) {
  return new ConstitutionalKnowledgeLayer(policySet);
}