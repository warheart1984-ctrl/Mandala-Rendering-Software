/**
 * FundingOS Governance Kernel — Decision pipeline for funding + MRS operations.
 */

import { CONTRACTS, resolveAuthority } from "../constitution/contracts.js";
import { CHARTER, enforcedPrinciples } from "../constitution/charter.js";
import * as policies from "./policies/default.policies.json";

export class GovernanceKernel {
  constructor(ckl, cse, provenance) {
    this.ckl = ckl;
    this.cse = cse;
    this.provenance = provenance;
  }

  async evaluate(intent, context, evidence = []) {
    // 1. Verify intent exists (P1)
    if (!intent) {
      return this.deny("INTENT_REQUIRED", "No intent provided", []);
    }

    // 2. Resolve actor authority (P3)
    const auth = resolveAuthority(context.actorId, intent.action);
    if (!auth.ok) {
      return this.deny("AUTHORITY_DENIED", auth.reason, [], auth.contractId);
    }

    // 3. Evaluate policies via CKL
    const decision = await this.ckl.evaluate(intent, context, evidence);

    // 4. Record provenance
    this.provenance.record({
      intentId: intent.id,
      actorId: context.actorId,
      action: intent.action,
      decision: decision.verdict,
      policiesApplied: decision.policiesApplied,
      timestamp: Date.now()
    });

    // 5. If approved, transition state via CSE
    if (decision.verdict === "allow") {
      await this.cse.transition(intent, context, decision);
    }

    return decision;
  }

  deny(code, reason, policiesApplied, contractId) {
    return {
      verdict: "deny",
      code,
      reason,
      policiesApplied,
      contractId,
      paramAdjust: null,
      attachProvenance: false
    };
  }
}

export function createGovernanceKernel(ckl, cse, provenance) {
  return new GovernanceKernel(ckl, cse, provenance);
}