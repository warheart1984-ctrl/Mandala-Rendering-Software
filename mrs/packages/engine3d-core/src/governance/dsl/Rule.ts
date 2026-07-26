import type { GovernanceSignal } from "../CIEMSOverlay.js";

/**
 * Evaluation context for Engine3D governance rules.
 * Pure data — no I/O. Cluster Channel B wiring is declared/future.
 */
export interface GovernanceRuleContext {
  replay: {
    visualMod: {
      shaderParams: Record<string, number>;
    };
  };
  contract: {
    maxFrameTimeMs: number;
  };
  signals: GovernanceSignal[];
}

export interface GovernanceRule {
  id: string;
  condition: (ctx: GovernanceRuleContext) => boolean;
  action: (ctx: GovernanceRuleContext) => void;
}

/**
 * Textual `.ciems` parser (`rule <id> when … then …`) is **declared / future**.
 * Hand-compiled rules in `defaultRules.ts` are the tested path today.
 */
export type CiemsTextualDslStatus = "declared-future";
