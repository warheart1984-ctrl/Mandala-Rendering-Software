import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemporalDenoiser, OIDNDenoiser, estimateVariance, adaptiveSampleAllocation } from "../TemporalDenoiser.js";

describe("TemporalDenoiser — Construction & Configuration", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const denoiser = new TemporalDenoiser();
      assert.equal(denoiser.historyLength, 8);
      assert.equal(denoiser.sigmaColor, 0.1);
      assert.equal(denoiser.sigmaNormal, 0.1);
      assert.equal(denoiser.sigmaDepth, 0.1);
      assert.equal(denoiser.lobeAngle, 0.1);
      assert.equal(denoiser.history.length, 0);
      assert.equal(denoiser.maxHistory, 8);
    });

    it("initializes with custom values", () => {
      const denoiser = new TemporalDenoiser({
        historyLength: 16,
        sigmaColor: 0.2,
        sigmaNormal: 0.15,
        sigmaDepth: 0.05,
        lobeAngle: 0.2
      });
      assert.equal(denoiser.historyLength, 16);
      assert.equal(denoiser.sigmaColor, 0.2);
      assert.equal(denoiser.sigmaNormal, 0.15);
      assert.equal(denoiser.sigmaDepth, 0.05);
      assert.equal(denoiser.lobeAngle, 0.2);
      assert.equal(denoiser.maxHistory, 16);
    });
  });

  describe("addFrame", () => {
    it("adds frame to history", () => {
      const denoiser = new TemporalDenoiser({ historyLength: 4 });
      const frame = {
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        albedo: new Float32Array([0.18, 0.18, 0.18]),
        normal: new Float32Array([0, 1, 0]),
        depth: new Float32Array([1.0]),
        motion: new Float32Array([0, 0]),
        camera: {}
      };
      
      denoiser.addFrame(frame);
      assert.equal(denoiser.history.length, 1);
    });

    it("limits history to maxHistory", () => {
      const denoiser = new TemporalDenoiser({ historyLength: 2 });
      const baseFrame = {
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        albedo: new Float32Array([0.18, 0.18, 0.18]),
        normal: new Float32Array([0, 1, 0]),
        depth: new Float32Array([1.0]),
        motion: new Float32Array([0, 0]),
        camera: {}
      };
      
      denoiser.addFrame(baseFrame);
      denoiser.addFrame(baseFrame);
      denoiser.addFrame(baseFrame);
      
      assert.equal(denoiser.history.length, 2);
    });
  });

  describe("denoise", () => {
    it("returns current frame when history is empty", () => {
      const denoiser = new TemporalDenoiser();
      const frame = {
        radiance: new Float32Array([0.5, 0.5, 0.5, 0.3, 0.3, 0.3]),
        albedo: new Float32Array([0.18, 0.18, 0.18, 0.18, 0.18, 0.18]),
        normal: new Float32Array([0, 1, 0, 0, 1, 0]),
        depth: new Float32Array([1.0, 1.0]),
        motion: new Float32Array([0, 0, 0, 0]),
        camera: {}
      };
      
      const result = denoiser.denoise(frame);
      assert.ok(result instanceof Float32Array);
      assert.equal(result.length, frame.radiance.length);
    });

    it("returns denoised radiance when history exists", () => {
      const denoiser = new TemporalDenoiser({ historyLength: 4 });
      
      // Add a previous frame
      const prevFrame = {
        radiance: new Float32Array(4 * 3).fill(0.5),
        albedo: new Float32Array(4 * 3).fill(0.18),
        normal: new Float32Array(4 * 3).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0),
        depth: new Float32Array(4).fill(1.0),
        motion: new Float32Array(4 * 2).fill(0),
        camera: {}
      };
      denoiser.addFrame(prevFrame);
      
      // Denoise current frame
      const currentFrame = {
        radiance: new Float32Array(4 * 3).fill(0.6),
        albedo: new Float32Array(4 * 3).fill(0.18),
        normal: new Float32Array(4 * 3).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0),
        depth: new Float32Array(4).fill(1.0),
        motion: new Float32Array(4 * 2).fill(0),
        camera: {}
      };
      
      const result = denoiser.denoise(currentFrame);
      assert.ok(result instanceof Float32Array);
      assert.equal(result.length, currentFrame.radiance.length);
      // Should be different from both current and previous
    });

    it("handles 2x2 pixel frame", () => {
      const denoiser = new TemporalDenoiser();
      const frame = {
        radiance: new Float32Array([
          1, 0, 0,   0, 1, 0,
          0, 0, 1,   1, 1, 0
        ]),
        albedo: new Float32Array(12).fill(0.18),
        normal: new Float32Array(12).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0),
        depth: new Float32Array([1, 1, 1, 1]),
        motion: new Float32Array(8).fill(0),
        camera: {}
      };
      
      const result = denoiser.denoise(frame);
      assert.equal(result.length, 12);
      // All values should be finite
      for (const v of result) {
        assert.ok(Number.isFinite(v));
      }
    });
  });

  describe("_atrousDenoise (internal)", () => {
    it("applies multi-scale filtering", () => {
      const denoiser = new TemporalDenoiser();
      const frame = {
        radiance: new Float32Array(4 * 3).fill(0.5),
        albedo: new Float32Array(4 * 3).fill(0.18),
        normal: new Float32Array(4 * 3).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0),
        depth: new Float32Array(4).fill(1.0),
        motion: new Float32Array(4 * 2).fill(0)
      };
      
      const result = denoiser._atrousDenoise(frame);
      assert.ok(result instanceof Float32Array);
      assert.equal(result.length, frame.radiance.length);
    });
  });

  describe("_reprojectFrame (internal)", () => {
    it("returns current frame when no motion vectors", () => {
      const denoiser = new TemporalDenoiser();
      const current = {
        radiance: new Float32Array(4 * 3).fill(0.5),
        motion: null
      };
      const prev = {
        radiance: new Float32Array(4 * 3).fill(0.3)
      };
      
      const result = denoiser._reprojectFrame(current, prev);
      assert.ok(result instanceof Float32Array);
      // Should be same as current when no motion
      for (let i = 0; i < result.length; i++) {
        assert.equal(result[i], current.radiance[i]);
      }
    });
  });
});

describe("OIDNDenoiser", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const denoiser = new OIDNDenoiser();
      assert.equal(denoiser.quality, "high");
      assert.equal(denoiser.useGPU, true);
      assert.equal(denoiser.cleanAux, true);
    });

    it("initializes with custom values", () => {
      const denoiser = new OIDNDenoiser({ quality: "medium", useGPU: false, cleanAux: false });
      assert.equal(denoiser.quality, "medium");
      assert.equal(denoiser.useGPU, false);
      assert.equal(denoiser.cleanAux, false);
    });
  });

  describe("denoise", () => {
    it("returns denoised radiance (falls back to temporal)", async () => {
      const denoiser = new OIDNDenoiser();
      const frame = {
        radiance: new Float32Array(4 * 3).fill(0.5),
        albedo: new Float32Array(4 * 3).fill(0.18),
        normal: new Float32Array(4 * 3).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0),
        depth: new Float32Array(4).fill(1.0),
        motion: new Float32Array(4 * 2).fill(0)
      };
      
      const result = await denoiser.denoise(frame);
      assert.ok(result instanceof Float32Array);
      assert.equal(result.length, frame.radiance.length);
    });
  });
});

describe("estimateVariance", () => {
  it("computes variance for uniform radiance", () => {
    const radiance = new Float32Array(16 * 3).fill(0.5);
    const variance = estimateVariance(radiance, 4, 4, 2);
    
    assert.ok(variance instanceof Float32Array);
    assert.equal(variance.length, 4); // 2x2 tiles
    for (const v of variance) {
      assert.equal(v, 0); // Zero variance for uniform
    }
  });

  it("computes higher variance for varied radiance", () => {
    const radiance = new Float32Array(16 * 3);
    for (let i = 0; i < 16; i++) {
      radiance[i * 3] = i % 2 === 0 ? 1.0 : 0.0;
      radiance[i * 3 + 1] = i % 2 === 0 ? 1.0 : 0.0;
      radiance[i * 3 + 2] = i % 2 === 0 ? 1.0 : 0.0;
    }
    const variance = estimateVariance(radiance, 4, 4, 2);
    
    assert.ok(variance.length === 4);
    for (const v of variance) {
      assert.ok(v > 0);
    }
  });
});

describe("adaptiveSampleAllocation", () => {
  it("allocates more samples to higher variance tiles", () => {
    const variance = new Float32Array([0.01, 0.04, 0.09, 0.16]);
    const allocation = adaptiveSampleAllocation(variance, 64, 1, 256);
    
    assert.equal(allocation.length, 4);
    // Higher variance should get more samples
    assert.ok(allocation[3] > allocation[0]);
    assert.ok(allocation[2] > allocation[0]);
    
    // All within bounds
    for (const spp of allocation) {
      assert.ok(spp >= 1 && spp <= 256);
    }
  });

  it("returns minSPP when all variance is zero", () => {
    const variance = new Float32Array([0, 0, 0, 0]);
    const allocation = adaptiveSampleAllocation(variance, 64, 4, 128);
    
    for (const spp of allocation) {
      assert.equal(spp, 4);
    }
  });

  it("respects maxSPP bound", () => {
    const variance = new Float32Array([100, 100, 100, 100]);
    const allocation = adaptiveSampleAllocation(variance, 64, 1, 16);
    
    for (const spp of allocation) {
      assert.ok(spp <= 16);
    }
  });
});