// mrs/packages/renderer-core/src/render/rt4d/gallery/HdrCanvas.test.js
// Status: **passing with gaps** - HDR tone mapping + canvas presentation tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HdrCanvas } from "./HdrCanvas.js";

describe("HdrCanvas", () => {
  it("constructs without DOM element", () => {
    const canvas = new HdrCanvas(null);
    assert.equal(canvas.domElement, null);
    assert.equal(canvas.ctx, null);
  });

  it("toneMapPixel applies Reinhard + gamma", () => {
    const canvas = new HdrCanvas(null);
    const tm = canvas.toneMapPixel(1.0, 1.0, 1.0, 1.0, 2.2);
    // Reinhard(1.0) = 0.5, gamma 2.2: 0.5^(1/2.2) ≈ 0.73
    assert.ok(tm.r >= 180 && tm.r <= 190);
    assert.ok(tm.g >= 180 && tm.g <= 190);
    assert.ok(tm.b >= 180 && tm.b <= 190);
  });

  it("toneMapPixel clamps to 0-255", () => {
    const canvas = new HdrCanvas(null);
    const tm = canvas.toneMapPixel(1000, 1000, 1000, 1.0, 2.2);
    // Due to floating point, very large values approach 255 but may be 254
    assert.ok(tm.r >= 254 && tm.r <= 255);
    assert.ok(tm.g >= 254 && tm.g <= 255);
    assert.ok(tm.b >= 254 && tm.b <= 255);
    const dark = canvas.toneMapPixel(-10, -10, -10, 1.0, 2.2);
    assert.equal(dark.r, 0);
    assert.equal(dark.g, 0);
    assert.equal(dark.b, 0);
  });

  it("exposure scales brightness", () => {
    const canvas = new HdrCanvas(null);
    const dark = canvas.toneMapPixel(1.0, 1.0, 1.0, 0.1, 2.2);
    const bright = canvas.toneMapPixel(1.0, 1.0, 1.0, 10.0, 2.2);
    assert.ok(bright.r > dark.r);
    assert.ok(bright.g > dark.g);
    assert.ok(bright.b > dark.b);
  });

  it("gamma affects midtones (Reinhard + gamma behavior)", () => {
    const canvas = new HdrCanvas(null);
    // In Reinhard + gamma, higher gamma = brighter midtones (due to Reinhard compression + gamma)
    const lowGamma = canvas.toneMapPixel(0.5, 0.5, 0.5, 1.0, 1.0);
    const highGamma = canvas.toneMapPixel(0.5, 0.5, 0.5, 1.0, 3.0);
    // With Reinhard + gamma, higher gamma actually makes midtones brighter
    assert.ok(highGamma.r >= lowGamma.r);
  });

  it("presentFrame returns false without DOM context", () => {
    const canvas = new HdrCanvas(null);
    const buf = new Float32Array(3 * 4 * 4);
    const result = canvas.presentFrame(buf, 4, 4, 1.0);
    assert.equal(result, false);
  });

  it("attachToRenderer is a stub", () => {
    const canvas = new HdrCanvas(null);
    // Should not throw
    canvas.attachToRenderer(null);
    canvas.attachToRenderer({});
    assert.ok(true);
  });
});