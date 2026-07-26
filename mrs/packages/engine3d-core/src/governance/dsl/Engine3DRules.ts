import type { GovernanceRule, GovernanceRuleContext } from "./Rule.js";

/**
 * Pure in-process rule set evaluator.
 * Status: **partial** — unit-tested; not wired into EngineHost or gRPC Channel B.
 */
export class Engine3DRules {
  private readonly rules: GovernanceRule[] = [];

  addRule(rule: GovernanceRule): void {
    this.rules.push(rule);
  }

  evaluate(ctx: GovernanceRuleContext): void {
    for (const rule of this.rules) {
      if (rule.condition(ctx)) {
        rule.action(ctx);
      }
    }
  }

  listRuleIds(): string[] {
    return this.rules.map((r) => r.id);
  }
}
