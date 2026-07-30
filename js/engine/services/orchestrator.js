/**
 * Execution Orchestrator — plan then execute governed actions.
 */

export class ExecutionOrchestrator {
  constructor({ gk, cse }) {
    this.gk = gk;
    this.cse = cse;
  }

  plan(intent, action) {
    return {
      planId: `plan-${intent.id}`,
      intentId: intent.id,
      action,
      phases: [
        "intent",
        "evidence",
        "planning",
        "execution",
        "validation",
        "replay",
      ],
      createdAt: new Date().toISOString(),
    };
  }

  async execute({ intent, evidence, action, run }) {
    const decision = this.gk.evaluateIntent(intent, evidence);
    if (!decision.ok) {
      throw new Error(decision.reason);
    }
    const plan = this.plan(intent, action);
    const csr = await this.cse.execute({ intent, evidence, action, run, decision });
    return { plan, decision, csr };
  }
}
