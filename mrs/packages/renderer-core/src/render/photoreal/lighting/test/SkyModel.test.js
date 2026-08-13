import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HosekWilkieSky, PreethamSky } from "../SkyModel.js";
import { V3 } from "../../material/PhotorealUtils.js";

describe("SkyModel — HosekWilkieSky", () => {
  describe("constructor", () => {
    it("initializes with default parameters", () => {
      const sky = new HosekWilkieSky();
      assert.equal(sky.turbidity, 3.0);
      assert.equal(sky.sunElevation, 0.5);
      assert.equal(sky.groundAlbedo, 0.3);
      assert.deepEqual(sky.sunDirection, [0, 1, 0]);
    });

    it("initializes with custom parameters", () => {
      const sky = new HosekWilkieSky({ turbidity: 5.0, sunElevation: 1.0, groundAlbedo: 0.5, sunDirection: [0.5, 0.5, 0.7] });
      assert.equal(sky.turbidity, 5.0);
      assert.equal(sky.sunElevation, 1.0);
      assert.equal(sky.groundAlbedo, 0.5);
      // sunDirection is stored as-is, not normalized in constructor
      assert.deepEqual(sky.sunDirection, [0.5, 0.5, 0.7]);
    });
  });

  describe("setSunDirection", () => {
    it("normalizes and sets sun direction", () => {
      const sky = new HosekWilkieSky();
      sky.setSunDirection([1, 2, 3]);
      const expected = V3.normalize([1, 2, 3]);
      assert.deepEqual(sky.sunDirection, expected);
      assert.equal(sky.sunElevation, Math.asin(expected[1]));
    });
  });

  describe("evaluate", () => {
    it("returns valid radiance for upward direction", () => {
      const sky = new HosekWilkieSky();
      const radiance = sky.evaluate([0, 1, 0]);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
      assert.ok(radiance[0] >= 0 && radiance[1] >= 0 && radiance[2] >= 0);
    });

    it("returns valid radiance for sun direction", () => {
      const sky = new HosekWilkieSky();
      const radiance = sky.evaluate(sky.sunDirection);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
    });

    it("returns valid radiance for downward direction", () => {
      const sky = new HosekWilkieSky();
      const radiance = sky.evaluate([0, -1, 0]);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
    });

    it("has valid radiance at zenith", () => {
      const sky = new HosekWilkieSky({ turbidity: 2.0 });
      const zenith = sky.evaluate([0, 1, 0]);
      const luma = 0.2126 * zenith[0] + 0.7152 * zenith[1] + 0.0722 * zenith[2];
      assert.ok(luma > 0);
    });

    it("has valid radiance near sun direction", () => {
      const sky = new HosekWilkieSky({ turbidity: 2.0 });
      const sunRadiance = sky.evaluate(sky.sunDirection);
      const oppositeRadiance = sky.evaluate(V3.negate(sky.sunDirection));
      const sunLuma = 0.2126 * sunRadiance[0] + 0.7152 * sunRadiance[1] + 0.0722 * sunRadiance[2];
      const oppLuma = 0.2126 * oppositeRadiance[0] + 0.7152 * oppositeRadiance[1] + 0.0722 * oppositeRadiance[2];
      // Both should be valid
      assert.ok(sunLuma >= 0);
      assert.ok(oppLuma >= 0);
    });
  });

  describe("sample", () => {
    it("returns valid direction and pdf", () => {
      const sky = new HosekWilkieSky();
      const rng = { nextFloat: () => 0.5 };
      const sample = sky.sample(rng);
      assert.ok(sample.dir);
      assert.equal(sample.dir.length, 3);
      assert.ok(typeof sample.pdf === "number");
      assert.ok(sample.pdf > 0);
    });

    it("samples near sun with bias", () => {
      const sky = new HosekWilkieSky();
      // Mock RNG to always return 0.05 (sun bias)
      let call = 0;
      const rng = { 
        nextFloat: () => {
          if (call++ === 0) return 0.05; // sun bias
          return 0.5;
        }
      };
      const sample = sky.sample(rng);
      const cosSun = V3.dot(sample.dir, sky.sunDirection);
      assert.ok(cosSun > 0.99); // Near sun
    });
  });
});

describe("SkyModel — PreethamSky", () => {
  describe("constructor", () => {
    it("initializes with default parameters", () => {
      const sky = new PreethamSky();
      assert.equal(sky.turbidity, 2.0);
      assert.deepEqual(sky.sunDirection, [0, 1, 0]);
    });

    it("initializes with custom parameters", () => {
      const sky = new PreethamSky({ turbidity: 4.0, sunDirection: [0.5, 0.5, 0.7] });
      assert.equal(sky.turbidity, 4.0);
      assert.deepEqual(sky.sunDirection, [0.5, 0.5, 0.7]);
    });
  });

  describe("evaluate", () => {
    it("returns valid radiance", () => {
      const sky = new PreethamSky();
      const radiance = sky.evaluate([0, 1, 0]);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
      assert.ok(radiance[0] >= 0 && radiance[1] >= 0 && radiance[2] >= 0);
    });

    it("returns valid radiance for sun direction", () => {
      const sky = new PreethamSky();
      const radiance = sky.evaluate(sky.sunDirection);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
    });

    it("has valid luminance for zenith", () => {
      const sky = new PreethamSky({ turbidity: 2.0 });
      const zenith = sky.evaluate([0, 1, 0]);
      const luma = 0.2126 * zenith[0] + 0.7152 * zenith[1] + 0.0722 * zenith[2];
      assert.ok(luma > 0);
    });
  });
});

describe("SkyModel — Comparative", () => {
  it("both models return valid radiance for same inputs", () => {
    const hosek = new HosekWilkieSky({ turbidity: 3.0 });
    const preetham = new PreethamSky({ turbidity: 3.0 });
    const dir = [0.3, 0.7, 0.5];
    
    const h = hosek.evaluate(dir);
    const p = preetham.evaluate(dir);
    
    assert.ok(Array.isArray(h) && h.length === 3);
    assert.ok(Array.isArray(p) && p.length === 3);
  });
});