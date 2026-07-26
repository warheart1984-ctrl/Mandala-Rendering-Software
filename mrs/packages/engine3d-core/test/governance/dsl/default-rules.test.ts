import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultEngine3DRules } from "../../../src/governance/rules/defaultRules.js";
import type { GovernanceRuleContext } from "../../../src/governance/dsl/Rule.js";

function baseCtx(
  overrides: Partial<{
    frameTimeMs: number;
    glyphIntensity: number;
    maxFrameTimeMs: number;
  }> = {},
): GovernanceRuleContext {
  return {
    replay: {
      visualMod: {
        shaderParams: {
          frameTimeMs: overrides.frameTimeMs ?? 1,
          glyphIntensity: overrides.glyphIntensity ?? 0.1,
        },
      },
    },
    contract: { maxFrameTimeMs: overrides.maxFrameTimeMs ?? 4 },
    signals: [],
  };
}

describe("governance-dsl-default-rules", () => {
  it("fires frame_time_exceeded when frameTimeMs exceeds contract", () => {
    const rules = createDefaultEngine3DRules();
    const ctx = baseCtx({ frameTimeMs: 10, maxFrameTimeMs: 4 });
    rules.evaluate(ctx);
    assert.equal(ctx.signals.length, 1);
    assert.equal(ctx.signals[0]!.id, "gov-crit-frame-time");
    assert.equal(ctx.signals[0]!.severity, "critical");
  });

  it("fires glyph_intensity_high when intensity > 0.8", () => {
    const rules = createDefaultEngine3DRules();
    const ctx = baseCtx({ glyphIntensity: 0.9 });
    rules.evaluate(ctx);
    assert.equal(ctx.signals.length, 1);
    assert.equal(ctx.signals[0]!.id, "gov-warn-glyph-intensity");
    assert.equal(ctx.signals[0]!.severity, "warn");
  });

  it("yields no signals for non-matching context", () => {
    const rules = createDefaultEngine3DRules();
    const ctx = baseCtx({ frameTimeMs: 2, glyphIntensity: 0.5, maxFrameTimeMs: 4 });
    rules.evaluate(ctx);
    assert.deepEqual(ctx.signals, []);
  });
});
