import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PhotorealCompositor, FilmCurves, applyFilmCurve } from "../PhotorealCompositor.js";
import { V3 } from "../material/PhotorealUtils.js";

describe("PhotorealCompositor — Construction & Configuration", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const comp = new PhotorealCompositor();
      assert.equal(comp.width, 1920);
      assert.equal(comp.height, 1080);
      assert.equal(comp.colorSpace, "sRGB");
      assert.equal(comp.tonemap, "aces");
      assert.equal(comp.exposure, 1.0);
      assert.equal(comp.gamma, 2.2);
      assert.equal(comp.bloom, true);
      assert.equal(comp.bloomStrength, 0.1);
      assert.equal(comp.bloomThreshold, 1.0);
      assert.equal(comp.filmGrain, false);
      assert.equal(comp.grainStrength, 0.02);
      assert.equal(comp.vignette, 0.3);
      assert.equal(comp.chromaticAberration, 0.0);
      assert.equal(comp.lensFlare, false);
      assert.equal(comp.filmCurve, "none");
      assert.equal(comp.lut3D, null);
    });

    it("initializes with custom values", () => {
      const comp = new PhotorealCompositor({
        width: 3840,
        height: 2160,
        colorSpace: "ACES",
        tonemap: "filmic",
        exposure: 2.0,
        gamma: 2.4,
        bloom: false,
        filmGrain: true,
        grainStrength: 0.05,
        vignette: 0.5,
        chromaticAberration: 0.01,
        lensFlare: true,
        filmCurve: "kodak2383"
      });
      assert.equal(comp.width, 3840);
      assert.equal(comp.height, 2160);
      assert.equal(comp.colorSpace, "ACES");
      assert.equal(comp.tonemap, "filmic");
      assert.equal(comp.exposure, 2.0);
      assert.equal(comp.gamma, 2.4);
      assert.equal(comp.bloom, false);
      assert.equal(comp.filmGrain, true);
      assert.equal(comp.grainStrength, 0.05);
      assert.equal(comp.vignette, 0.5);
      assert.equal(comp.chromaticAberration, 0.01);
      assert.equal(comp.lensFlare, true);
      assert.equal(comp.filmCurve, "kodak2383");
    });
  });
});

describe("PhotorealCompositor — Exposure", () => {
  it("applies exposure multiplier", () => {
    const comp = new PhotorealCompositor({ exposure: 2.0 });
    const color = new Float32Array([0.5, 0.5, 0.5]);
    const result = comp._applyExposure(color, 2.0);
    assert.equal(result[0], 1.0);
    assert.equal(result[1], 1.0);
    assert.equal(result[2], 1.0);
  });

  it("handles zero exposure", () => {
    const comp = new PhotorealCompositor();
    const color = new Float32Array([0.5, 0.5, 0.5]);
    const result = comp._applyExposure(color, 0.0);
    assert.equal(result[0], 0.0);
    assert.equal(result[1], 0.0);
    assert.equal(result[2], 0.0);
  });
});

describe("PhotorealCompositor — Tonemapping", () => {
  describe("_reinhard", () => {
    it("compresses high dynamic range", () => {
      const comp = new PhotorealCompositor({ tonemap: "reinhard" });
      const color = new Float32Array([10, 5, 2]);
      const result = comp._reinhard(new Float32Array(color));
      
      assert.ok(result[0] < 1.0);
      assert.ok(result[1] < 1.0);
      assert.ok(result[2] < 1.0);
      assert.ok(result[0] > 0);
      assert.ok(result[1] > 0);
      assert.ok(result[2] > 0);
    });

    it("preserves low values approximately", () => {
      const comp = new PhotorealCompositor({ tonemap: "reinhard" });
      const color = new Float32Array([0.1, 0.2, 0.3]);
      const result = comp._reinhard(new Float32Array(color));
      
      assert.ok(result[0] < 0.15);
      assert.ok(result[1] < 0.3);
      assert.ok(result[2] < 0.4);
    });

    it("handles zero luma", () => {
      const comp = new PhotorealCompositor({ tonemap: "reinhard" });
      const color = new Float32Array([0, 0, 0]);
      const result = comp._reinhard(new Float32Array(color));
      assert.deepEqual(result, [0, 0, 0]);
    });
  });

  describe("_acesTonemap", () => {
    it("maps HDR to [0, 1] range", () => {
      const comp = new PhotorealCompositor({ tonemap: "aces" });
      const color = new Float32Array([10, 100, 1000]);
      const result = comp._acesTonemap(new Float32Array(color));
      
      for (const v of result) {
        assert.ok(v >= 0 && v <= 1);
      }
    });

    it("preserves relative ratios approximately", () => {
      const comp = new PhotorealCompositor({ tonemap: "aces" });
      const color = new Float32Array([0.18, 0.18, 0.18]);
      const result = comp._acesTonemap(new Float32Array(color));
      
      // 18% gray should map to reasonable value
      assert.ok(result[0] > 0.1 && result[0] < 0.5);
    });
  });

  describe("_filmicTonemap", () => {
    it("maps HDR to [0, 1] range", () => {
      const comp = new PhotorealCompositor({ tonemap: "filmic" });
      const color = new Float32Array([10, 100, 1000]);
      const result = comp._filmicTonemap(new Float32Array(color));
      
      for (const v of result) {
        assert.ok(v >= 0 && v <= 1);
      }
    });

    it("handles zero input", () => {
      const comp = new PhotorealCompositor({ tonemap: "filmic" });
      const color = new Float32Array([0, 0, 0]);
      const result = comp._filmicTonemap(new Float32Array(color));
      assert.deepEqual(result, [0, 0, 0]);
    });
  });

  describe("_tonemap dispatch", () => {
    it("dispatches to reinhard", () => {
      const comp = new PhotorealCompositor({ tonemap: "reinhard" });
      const color = new Float32Array([1, 2, 3]);
      const result = comp._tonemap(new Float32Array(color));
      assert.ok(result[0] < 1.0);
    });

    it("dispatches to aces", () => {
      const comp = new PhotorealCompositor({ tonemap: "aces" });
      const color = new Float32Array([1, 2, 3]);
      const result = comp._tonemap(new Float32Array(color));
      assert.ok(result[0] <= 1.0);
    });

    it("dispatches to filmic", () => {
      const comp = new PhotorealCompositor({ tonemap: "filmic" });
      const color = new Float32Array([1, 2, 3]);
      const result = comp._tonemap(new Float32Array(color));
      assert.ok(result[0] <= 1.0);
    });

    it("returns unchanged for 'none'", () => {
      const comp = new PhotorealCompositor({ tonemap: "none" });
      const color = new Float32Array([0.5, 0.5, 0.5]);
      const result = comp._tonemap(new Float32Array(color));
      assert.deepEqual(result, [0.5, 0.5, 0.5]);
    });
  });
});

describe("PhotorealCompositor — Color Space", () => {
  describe("_linearToSRGB", () => {
    it("converts linear to sRGB", () => {
      const comp = new PhotorealCompositor({ colorSpace: "sRGB" });
      const linear = new Float32Array([0.0, 0.5, 1.0]);
      const result = comp._linearToSRGB(new Float32Array(linear));
      
      assert.equal(result[0], 0.0);
      assert.ok(result[1] > 0.5 && result[1] < 0.8);
      assert.equal(result[2], 1.0);
    });

    it("handles values below threshold", () => {
      const comp = new PhotorealCompositor({ colorSpace: "sRGB" });
      const linear = new Float32Array([0.001]);
      const result = comp._linearToSRGB(new Float32Array(linear));
      assert.ok(Math.abs(result[0] - 0.001 * 12.92) < 1e-4);
    });
  });

  describe("_colorSpaceTransform dispatch", () => {
    it("returns linear unchanged", () => {
      const comp = new PhotorealCompositor({ colorSpace: "linear" });
      const color = new Float32Array([0.5, 0.5, 0.5]);
      const result = comp._colorSpaceTransform(new Float32Array(color));
      assert.deepEqual(result, [0.5, 0.5, 0.5]);
    });

    it("converts to sRGB", () => {
      const comp = new PhotorealCompositor({ colorSpace: "sRGB" });
      const color = new Float32Array([1.0]);
      const result = comp._colorSpaceTransform(new Float32Array(color));
      assert.equal(result[0], 1.0);
    });
  });
});

describe("PhotorealCompositor — Gamma Correction", () => {
  it("applies inverse gamma", () => {
    const comp = new PhotorealCompositor({ gamma: 2.2 });
    const color = new Float32Array([0.5, 0.5, 0.5]);
    const result = comp._gammaCorrect(new Float32Array(color));
    
    const expected = Math.pow(0.5, 1 / 2.2);
    assert.ok(Math.abs(result[0] - expected) < 1e-4);
  });

  it("clamps to [0, 1] before gamma", () => {
    const comp = new PhotorealCompositor({ gamma: 2.2 });
    const color = new Float32Array([-0.5, 1.5, 0.5]);
    const result = comp._gammaCorrect(new Float32Array(color));
    
    assert.equal(result[0], 0.0);
    assert.equal(result[1], 1.0);
    assert.ok(Math.abs(result[2] - Math.pow(0.5, 1 / 2.2)) < 1e-4);
  });
});

describe("PhotorealCompositor — Film Grain", () => {
  it("adds noise when enabled", () => {
    const comp = new PhotorealCompositor({ filmGrain: true, grainStrength: 0.1 });
    const color = new Float32Array(100).fill(0.5);
    const result = comp._addFilmGrain(new Float32Array(color));
    
    // Should have variation
    let hasVariation = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] !== 0.5) { hasVariation = true; break; }
    }
    assert.ok(hasVariation);
  });

  it("does nothing when disabled", () => {
    const comp = new PhotorealCompositor({ filmGrain: false });
    const color = new Float32Array([0.5, 0.5, 0.5]);
    const result = comp._addFilmGrain(new Float32Array(color));
    assert.deepEqual(result, [0.5, 0.5, 0.5]);
  });
});

describe("PhotorealCompositor — Output Format", () => {
  it("converts to Uint8", () => {
    const comp = new PhotorealCompositor();
    const color = new Float32Array([0.0, 0.5, 1.0, 1.5]);
    const result = comp._toOutputFormat(color);
    
    assert.ok(result instanceof Uint8Array);
    assert.equal(result[0], 0);
    assert.equal(result[1], 127);
    assert.equal(result[2], 255);
    assert.equal(result[3], 255); // Clamped
  });
});

describe("PhotorealCompositor — Full Pipeline", () => {
  it("composites frame end-to-end", () => {
    const comp = new PhotorealCompositor({ width: 64, height: 64 });
    const radiance = new Float32Array(64 * 64 * 3).fill(1.0);
    const frame = {
      radiance,
      aovs: {},
      camera: {},
      width: 64,
      height: 64
    };
    
    const result = comp.composite(frame);
    assert.ok(result instanceof Uint8Array);
    assert.equal(result.length, 64 * 64 * 3);
    // All should be 255 (white after tonemap + gamma)
    for (const v of result) {
      assert.equal(v, 255);
    }
  });

  it("applies exposure before tonemap", () => {
    const comp = new PhotorealCompositor({ exposure: 0.5, tonemap: "reinhard" });
    const radiance = new Float32Array(4 * 3).fill(10.0);
    const frame = { radiance, aovs: {}, camera: {}, width: 2, height: 2 };
    
    const result = comp.composite(frame);
    // With 0.5 exposure, 10 -> 5, reinhard(5) = 5/6 ≈ 0.833
    // After gamma 2.2: 0.833^(1/2.2) ≈ 0.91 -> 232
    assert.ok(result[0] > 200 && result[0] < 255);
  });
});

describe("FilmCurves", () => {
  it("exports kodak2383 and fuji3510", () => {
    assert.ok(FilmCurves.kodak2383);
    assert.ok(FilmCurves.fuji3510);
  });
});

describe("applyFilmCurve", () => {
  it("returns color unchanged (stub)", () => {
    const color = new Float32Array([0.5, 0.5, 0.5]);
    const result = applyFilmCurve(color, "kodak2383");
    assert.deepEqual(result, color);
  });
});