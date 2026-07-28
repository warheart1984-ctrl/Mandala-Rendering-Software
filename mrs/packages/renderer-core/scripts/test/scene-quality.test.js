/**
 * Unit tests for sceneQuality helpers (stratified / adaptive / tonemap encode).
 * STATUS: **enforced**
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stratifiedJitter2d,
  clampFirefly,
  accumulateAdaptive,
  encodeBeautyRgb,
} from "../lib/sceneQuality.mjs";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("sceneQuality", () => {
  it("stratifiedJitter2d is deterministic and in unit square", () => {
    const rng = mulberry32(42);
    const a = stratifiedJitter2d(0, 16, rng);
    const rng2 = mulberry32(42);
    const b = stratifiedJitter2d(0, 16, rng2);
    assert.deepEqual(a, b);
    assert.ok(a[0] >= 0 && a[0] < 1);
    assert.ok(a[1] >= 0 && a[1] < 1);
  });

  it("clampFirefly caps channels", () => {
    const c = clampFirefly({ x: 100, y: -1, z: 8 }, 16);
    assert.equal(c.x, 16);
    assert.equal(c.y, 0);
    assert.equal(c.z, 8);
  });

  it("accumulateAdaptive early-stops on flat signal", () => {
    const r = accumulateAdaptive({
      minSamples: 4,
      maxSamples: 32,
      varianceThreshold: 0.0025,
      sampleFn: () => ({ x: 0.5, y: 0.5, z: 0.5 }),
    });
    assert.equal(r.earlyStop, true);
    assert.ok(r.samplesUsed < 32);
    assert.ok(r.samplesUsed >= 4);
    assert.ok(Math.abs(r.r - 0.5) < 1e-9);
  });

  it("accumulateAdaptive uses maxSamples on noisy signal", () => {
    const rng = mulberry32(9);
    const r = accumulateAdaptive({
      minSamples: 4,
      maxSamples: 12,
      varianceThreshold: 1e-12,
      sampleFn: () => ({ x: rng(), y: rng(), z: rng() }),
    });
    assert.equal(r.samplesUsed, 12);
  });

  it("encodeBeautyRgb is deterministic", () => {
    const a = encodeBeautyRgb(0.8, 0.4, 0.2, {
      exposure: 1.55,
      tonemap: "aces-lite",
    });
    const b = encodeBeautyRgb(0.8, 0.4, 0.2, {
      exposure: 1.55,
      tonemap: "aces-lite",
    });
    assert.deepEqual(a, b);
    assert.ok(a[0] >= 0 && a[0] <= 255);
  });
});
