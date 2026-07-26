import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GlyphSubstrate4D } from "../../src/substrate/Substrate4D.js";
import { DefaultGlyphEngine4D } from "../../src/substrate/GlyphEngine4D.js";

describe("substrate-update", () => {
  it("maps lifted4D to VisualMod with glyph counts", () => {
    const engine = new DefaultGlyphEngine4D();
    const substrate = new GlyphSubstrate4D(engine);
    const lifted = {
      positions4D: new Float32Array([1, 2, 3, 1, 4, 5, 6, 1]),
      velocities4D: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0]),
    };
    const glyphs = engine.generateGlyphs(lifted);
    assert.equal(glyphs.length, 2);
    const mod = substrate.update(lifted);
    assert.equal(mod.scales.length, 2);
    assert.equal(mod.colors.length, 8);
    assert.equal(mod.shaderParams["glyphCount"], 2);
    assert.ok(typeof mod.shaderParams["glyphIntensity"] === "number");
  });
});
