import { Engine3DRules } from "../dsl/Engine3DRules.js";
import type { GovernanceRuleContext } from "../dsl/Rule.js";

/**
 * Default hand-compiled Engine3D governance rules.
 * Textual `.ciems` DSL parser: declared/future (see Rule.ts).
 * Status: **partial** (unit-tested evaluate()).
 */
export function createDefaultEngine3DRules(): Engine3DRules {
  const rules = new Engine3DRules();

  rules.addRule({
    id: "frame_time_exceeded",
    condition: (ctx: GovernanceRuleContext): boolean => {
      const frameTimeMs = ctx.replay.visualMod.shaderParams["frameTimeMs"] ?? 0;
      return frameTimeMs > ctx.contract.maxFrameTimeMs;
    },
    action: (ctx: GovernanceRuleContext): void => {
      ctx.signals.push({
        id: "gov-crit-frame-time",
        severity: "critical",
        message: "Frame time exceeded contract",
        position3D: [0, 0, 0],
      });
    },
  });

  rules.addRule({
    id: "glyph_intensity_high",
    condition: (ctx: GovernanceRuleContext): boolean => {
      const intensity = ctx.replay.visualMod.shaderParams["glyphIntensity"] ?? 0;
      return intensity > 0.8;
    },
    action: (ctx: GovernanceRuleContext): void => {
      ctx.signals.push({
        id: "gov-warn-glyph-intensity",
        severity: "warn",
        message: "Glyph intensity high",
        position3D: [0, 0, 0],
      });
    },
  });

  return rules;
}
