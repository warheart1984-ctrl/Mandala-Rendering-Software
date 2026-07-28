/**
 * Proton HQ quality / tonemap / supersample tests.
 *
 * STATUS: **enforced** — preset table, tonemap + supersample determinism.
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 * No GPU / path-trace claims.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  resolveQualityPreset,
  QUALITY_PRESET_TABLE,
} from "./qualityPreset.js";
import { applyTonemap } from "./tonemap.js";
import { renderDims, downsampleBox } from "./supersample.js";
import { applyBloom } from "./bloom.js";
import {
  runProtonPipeline,
  demoSceneSpec,
} from "./pipeline.js";

/**
 * @param {Float32Array|number[]} buf
 */
function shaFloat(buf) {
  const u8 =
    buf instanceof Float32Array
      ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
      : Buffer.from(Float32Array.from(buf).buffer);
  return createHash("sha256").update(u8).digest("hex");
}

describe("proton HQ quality", () => {
  it("exports resolveQualityPreset and preset table", () => {
    assert.equal(typeof resolveQualityPreset, "function");
    assert.ok(QUALITY_PRESET_TABLE.default);
    assert.ok(QUALITY_PRESET_TABLE.high);
  });

  it("resolveQualityPreset returns high / default shapes with antifog enrich", () => {
    const high = resolveQualityPreset("high");
    assert.equal(high.id, "high");
    assert.equal(high.width, 512);
    assert.equal(high.supersample, 2);
    assert.equal(high.tonemap, "aces-lite");
    assert.equal(high.lightingPunch, true);
    assert.equal(high.bloom, false);
    assert.ok(high.maxRadius <= 0.72);
    assert.ok(high.maxRadius >= 0.65);
    assert.ok(high.radiusScale >= 1.55 && high.radiusScale <= 1.7);
    assert.ok(high.colorGain >= 1.45 && high.colorGain <= 1.55);
    assert.equal(high.densityBoost, 1.4);
    assert.equal(high.opacityScale, 1.15);
    assert.equal(high.sigmaScale, 1.1);
    assert.equal(high.exposure, 1.35);

    const def = resolveQualityPreset("default");
    assert.equal(def.width, 256);
    assert.equal(def.supersample, 1);
    assert.equal(def.lightingPunch, false);
    assert.equal(def.maxRadius, 0.72);
  });

  it("throws on unknown preset id", () => {
    assert.throws(() => resolveQualityPreset("ultra"), /unknown QualityPresetId/);
  });

  it("applyTonemap aces-lite is deterministic", () => {
    const buf = new Float32Array([
      0.2, 0.5, 1.2, 1, 0.8, 0.1, 0.05, 1, 1.5, 1.5, 1.5, 0.5,
    ]);
    const a = applyTonemap(buf, {
      mode: "aces-lite",
      exposure: 1.35,
      gamma: 2.2,
    });
    const b = applyTonemap(buf, {
      mode: "aces-lite",
      exposure: 1.35,
      gamma: 2.2,
    });
    assert.equal(shaFloat(a), shaFloat(b));
    assert.ok(a instanceof Float32Array);
    assert.notEqual(a, buf);
    // Alpha preserved
    assert.equal(a[3], 1);
    assert.equal(a[7], 1);
    assert.equal(a[11], 0.5);
    // Curve compresses HDR-ish values into display range
    assert.ok(a[0] >= 0 && a[0] <= 1.5);
    assert.ok(a[2] < 1.2 * 1.35);
  });

  it("applyTonemap reinhard is deterministic and differs from identity", () => {
    const buf = new Float32Array([0.9, 0.5, 0.1, 1]);
    const a = applyTonemap(buf, { mode: "reinhard", exposure: 1, gamma: 2.2 });
    const b = applyTonemap(buf, { mode: "reinhard", exposure: 1, gamma: 2.2 });
    assert.equal(shaFloat(a), shaFloat(b));
    const id = applyTonemap(buf, { mode: "none", exposure: 1 });
    assert.equal(id, buf);
    assert.notEqual(shaFloat(a), shaFloat(buf));
  });

  it("downsampleBox 2x is deterministic and averages blocks", () => {
    // 2×2 source → 1×1 dest, 4 channels
    const src = new Float32Array([
      1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1,
    ]);
    const a = downsampleBox(src, 2, 2, 1, 1, 4);
    const b = downsampleBox(src, 2, 2, 1, 1, 4);
    assert.equal(shaFloat(a), shaFloat(b));
    assert.equal(a.length, 4);
    assert.ok(Math.abs(a[0] - 0.5) < 1e-6);
    assert.ok(Math.abs(a[1] - 0.5) < 1e-6);
    assert.ok(Math.abs(a[2] - 0.5) < 1e-6);
    assert.equal(a[3], 1);

    const d = renderDims(256, 256, 2);
    assert.equal(d.width, 512);
    assert.equal(d.height, 512);
  });

  it("pipeline supersample+tonemap yields stable frameSha256", () => {
    const scene = demoSceneSpec();
    const opts = {
      intentId: "intent-hq-ss-tonemap",
      width: 32,
      height: 32,
      supersample: 2,
      tonemap: /** @type {"aces-lite"} */ ("aces-lite"),
      exposure: 1.35,
      skipLighting: true,
    };
    const a = runProtonPipeline(scene, opts);
    const b = runProtonPipeline(scene, opts);
    assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
    assert.equal(a.raster.width, 32);
    assert.equal(a.raster.height, 32);
    assert.equal(a.evidence.supersample, 2);
    assert.equal(a.evidence.renderWidth, 64);
    assert.equal(a.evidence.tonemap, "aces-lite");
  });

  it("applyBloom is declared stub (throws)", () => {
    assert.equal(typeof applyBloom, "function");
    assert.throws(() => applyBloom(new Float32Array(4)), /declared/);
  });
});
