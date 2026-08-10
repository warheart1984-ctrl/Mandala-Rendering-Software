// mrs/packages/renderer-core/src/render/rt4d/proton/qualityPreset.test.js
// Status: **passing with gaps** - qualityPreset table + resolve tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveQualityPreset, QUALITY_PRESET_TABLE } from "./qualityPreset.js";

describe("qualityPreset", () => {
  it("QUALITY_PRESET_TABLE has default and high presets", () => {
    assert.ok("default" in QUALITY_PRESET_TABLE);
    assert.ok("high" in QUALITY_PRESET_TABLE);
  });

  it("default preset has expected values", () => {
    const p = QUALITY_PRESET_TABLE.default;
    assert.equal(p.width, 256);
    assert.equal(p.height, 256);
    assert.equal(p.supersample, 1);
    assert.equal(p.tonemap, "none");
    assert.equal(p.exposure, 1);
    assert.equal(p.gamma, 2.2);
    assert.equal(p.densityBoost, 1);
    assert.equal(p.radiusScale, 1.55);
    assert.equal(p.colorGain, 1.35);
    assert.equal(p.maxRadius, 0.72);
    assert.equal(p.sigmaScale, 1);
    assert.equal(p.opacityScale, 1);
    assert.equal(p.lightingPunch, false);
    assert.equal(p.bloom, false);
    assert.equal(p.depthCue, false);
  });

  it("high preset has expected values", () => {
    const p = QUALITY_PRESET_TABLE.high;
    assert.equal(p.width, 512);
    assert.equal(p.height, 512);
    assert.equal(p.supersample, 2);
    assert.equal(p.tonemap, "aces-lite");
    assert.equal(p.exposure, 1.35);
    assert.equal(p.gamma, 2.2);
    assert.equal(p.densityBoost, 1.4);
    assert.equal(p.radiusScale, 1.65);
    assert.equal(p.colorGain, 1.5);
    assert.equal(p.maxRadius, 0.68);
    assert.equal(p.sigmaScale, 1.1);
    assert.equal(p.opacityScale, 1.15);
    assert.equal(p.lightingPunch, true);
    assert.equal(p.bloom, false);
    assert.equal(p.depthCue, false);
  });

  it("highBloom preset has expected values with bloom enabled", () => {
    const p = QUALITY_PRESET_TABLE.highBloom;
    assert.equal(p.width, 512);
    assert.equal(p.height, 512);
    assert.equal(p.supersample, 2);
    assert.equal(p.tonemap, "aces-lite");
    assert.equal(p.exposure, 1.35);
    assert.equal(p.gamma, 2.2);
    assert.equal(p.densityBoost, 1.4);
    assert.equal(p.radiusScale, 1.65);
    assert.equal(p.colorGain, 1.5);
    assert.equal(p.maxRadius, 0.68);
    assert.equal(p.sigmaScale, 1.1);
    assert.equal(p.opacityScale, 1.15);
    assert.equal(p.lightingPunch, true);
    assert.equal(p.bloom, true);
    assert.equal(p.depthCue, false);
  });

  it("resolveQualityPreset returns highBloom for 'highBloom'", () => {
    const p = resolveQualityPreset("highBloom");
    assert.equal(p.id, "highBloom");
    assert.equal(p.width, 512);
    assert.equal(p.height, 512);
    assert.equal(p.bloom, true);
  });

  it("resolveQualityPreset returns default for 'default'", () => {
    const p = resolveQualityPreset("default");
    assert.equal(p.id, "default");
    assert.equal(p.width, 256);
    assert.equal(p.height, 256);
  });

  it("resolveQualityPreset returns high for 'high'", () => {
    const p = resolveQualityPreset("high");
    assert.equal(p.id, "high");
    assert.equal(p.width, 512);
    assert.equal(p.height, 512);
  });

  it("resolveQualityPreset throws on unknown id", () => {
    assert.throws(
      () => resolveQualityPreset("unknown"),
      /unknown QualityPresetId "unknown"/
    );
  });

  it("resolveQualityPreset defaults to 'default' for empty string", () => {
    const p = resolveQualityPreset("");
    assert.equal(p.id, "default");
  });

  it("resolveQualityPreset defaults to 'default' for null/undefined", () => {
    const p1 = resolveQualityPreset(null);
    assert.equal(p1.id, "default");
    const p2 = resolveQualityPreset(undefined);
    assert.equal(p2.id, "default");
  });

  it("resolveQualityPreset accepts shallow overrides", () => {
    const p = resolveQualityPreset("default", { width: 1024, height: 1024 });
    assert.equal(p.id, "default");
    assert.equal(p.width, 1024);
    assert.equal(p.height, 1024);
    assert.equal(p.supersample, 1); // from base
  });

  it("resolveQualityPreset overrides only provided fields", () => {
    const p = resolveQualityPreset("high", { width: 1024, bloom: true });
    assert.equal(p.id, "high");
    assert.equal(p.width, 1024);
    assert.equal(p.bloom, true);
    assert.equal(p.height, 512); // from base
  });

  it("QUALITY_PRESET_TABLE is frozen", () => {
    assert.throws(() => { QUALITY_PRESET_TABLE.default.width = 999; });
    assert.throws(() => { QUALITY_PRESET_TABLE.high = "hacked"; });
  });

  it("resolveQualityPreset returns frozen object", () => {
    const p = resolveQualityPreset("default");
    assert.throws(() => { p.width = 999; });
  });
});