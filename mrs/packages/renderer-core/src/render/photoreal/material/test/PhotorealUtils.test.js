import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PhotorealRNG,
  V3,
  buildONB,
  sampleCosineHemisphere,
  sampleSphere,
  fresnelSchlick,
  fresnelConductor,
  ggxNDF,
  smithGGX,
  disneyBRDF,
  sampleDiffuse,
  sampleGGX
} from "../PhotorealUtils.js";

describe("PhotorealUtils — Vector Math & RNG", () => {
  describe("PhotorealRNG — Deterministic RNG", () => {
    it("produces same sequence for same seed", () => {
      const rng1 = new PhotorealRNG(0x5EED4D00);
      const rng2 = new PhotorealRNG(0x5EED4D00);
      
      for (let i = 0; i < 100; i++) {
        assert.equal(rng1.next(), rng2.next());
      }
    });

    it("produces different sequences for different seeds", () => {
      const rng1 = new PhotorealRNG(0x5EED4D00);
      const rng2 = new PhotorealRNG(0x12345678);
      
      let same = true;
      for (let i = 0; i < 100; i++) {
        if (rng1.next() !== rng2.next()) { same = false; break; }
      }
      assert.ok(!same);
    });

    it("nextFloat returns values in [0, 1)", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      for (let i = 0; i < 1000; i++) {
        const v = rng.nextFloat();
        assert.ok(v >= 0 && v < 1);
      }
    });

    it("nextGaussian produces valid samples", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      for (let i = 0; i < 100; i++) {
        const v = rng.nextGaussian();
        assert.ok(Number.isFinite(v));
      }
    });
  });

  describe("V3 — Vector Operations", () => {
    it("add/sub/mul/div/dot/cross/length/normalize/lerp/clamp/mulVec/addVec", () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      
      assert.deepEqual(V3.add(a, b), [5, 7, 9]);
      assert.deepEqual(V3.sub(a, b), [-3, -3, -3]);
      assert.deepEqual(V3.mul(a, 2), [2, 4, 6]);
      assert.deepEqual(V3.div(a, 2), [0.5, 1, 1.5]);
      assert.equal(V3.dot(a, b), 32);
      assert.deepEqual(V3.cross(a, b), [-3, 6, -3]);
      assert.ok(Math.abs(V3.length([3, 4, 0]) - 5) < 1e-6);
      assert.deepEqual(V3.normalize([3, 4, 0]), [0.6, 0.8, 0]);
      assert.deepEqual(V3.lerp([0, 0, 0], [10, 10, 10], 0.5), [5, 5, 5]);
      assert.deepEqual(V3.clamp([-1, 0.5, 2], 0, 1), [0, 0.5, 1]);
      assert.deepEqual(V3.mulVec(a, b), [4, 10, 18]);
      assert.deepEqual(V3.addVec(a, b), [5, 7, 9]);
    });

    it("normalize handles zero vector", () => {
      assert.deepEqual(V3.normalize([0, 0, 0]), [0, 0, 0]);
    });
  });

  describe("buildONB — Orthonormal Basis", () => {
    it("produces orthonormal basis", () => {
      const normal = [0, 1, 0];
      const { tangent, bitangent, normal: n } = buildONB(normal);
      
      assert.ok(Math.abs(V3.dot(tangent, bitangent)) < 1e-6);
      assert.ok(Math.abs(V3.dot(tangent, n)) < 1e-6);
      assert.ok(Math.abs(V3.dot(bitangent, n)) < 1e-6);
      assert.ok(Math.abs(V3.length(tangent) - 1) < 1e-6);
      assert.ok(Math.abs(V3.length(bitangent) - 1) < 1e-6);
      assert.ok(Math.abs(V3.length(n) - 1) < 1e-6);
    });

    it("handles arbitrary normal", () => {
      const normal = V3.normalize([1, 2, 3]);
      const { tangent, bitangent, normal: n } = buildONB(normal);
      
      assert.ok(Math.abs(V3.dot(tangent, bitangent)) < 1e-6);
      assert.ok(Math.abs(V3.dot(tangent, n)) < 1e-6);
      assert.ok(Math.abs(V3.dot(bitangent, n)) < 1e-6);
    });
  });

  describe("sampleCosineHemisphere — Cosine-weighted sampling", () => {
    it("returns normalized vectors", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      const normal = [0, 1, 0];
      
      for (let i = 0; i < 100; i++) {
        const v = sampleCosineHemisphere(rng, normal);
        assert.ok(Math.abs(V3.length(v) - 1) < 1e-6);
        assert.ok(V3.dot(v, normal) > 0); // Same hemisphere
      }
    });
  });

  describe("sampleSphere — Uniform sphere sampling", () => {
    it("returns normalized vectors", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      
      for (let i = 0; i < 100; i++) {
        const v = sampleSphere(rng);
        assert.ok(Math.abs(V3.length(v) - 1) < 1e-6);
      }
    });
  });

  describe("fresnelSchlick — Schlick approximation", () => {
    it("returns [1,1,1] at grazing angle (cosTheta=0)", () => {
      const F0 = [0.04, 0.04, 0.04];
      const F = fresnelSchlick(0, F0);
      assert.deepEqual(F, [1, 1, 1]);
    });

    it("returns F0 at normal incidence (cosTheta=1)", () => {
      const F0 = [0.04, 0.04, 0.04];
      const F = fresnelSchlick(1, F0);
      assert.deepEqual(F, F0);
    });

    it("monotonically increases as cosTheta decreases", () => {
      const F0 = [0.04, 0.04, 0.04];
      const F1 = fresnelSchlick(0.9, F0);
      const F2 = fresnelSchlick(0.1, F0);
      assert.ok(F2[0] >= F1[0]);
    });
  });

  describe("fresnelConductor — Complex IOR Fresnel", () => {
    it("returns valid reflectance for gold", () => {
      const eta = [0.17, 0.35, 1.5];
      const k = [3.42, 2.37, 1.81];
      const F = fresnelConductor(0.5, eta, k);
      
      assert.ok(F[0] >= 0 && F[0] <= 1);
      assert.ok(F[1] >= 0 && F[1] <= 1);
      assert.ok(F[2] >= 0 && F[2] <= 1);
    });

    it("returns [1,1,1] at grazing angle", () => {
      const eta = [0.17, 0.35, 1.5];
      const k = [3.42, 2.37, 1.81];
      const F = fresnelConductor(0, eta, k);
      assert.deepEqual(F, [1, 1, 1]);
    });
  });

  describe("ggxNDF — Normal Distribution Function", () => {
    it("returns positive values", () => {
      const normal = [0, 1, 0];
      const half = [0, 1, 0];
      const D = ggxNDF(normal, half, 0.5);
      assert.ok(D > 0);
    });

    it("peaks at half == normal", () => {
      const normal = [0, 1, 0];
      const D1 = ggxNDF(normal, normal, 0.5);
      const D2 = ggxNDF(normal, [0.707, 0.707, 0], 0.5);
      assert.ok(D1 > D2);
    });

    it("decreases with roughness (alpha)", () => {
      const normal = [0, 1, 0];
      const half = [0, 1, 0];
      const D1 = ggxNDF(normal, half, 0.1);
      const D2 = ggxNDF(normal, half, 0.5);
      assert.ok(D1 > D2);
    });
  });

  describe("smithGGX — Geometry Term", () => {
    it("returns values in [0, 1]", () => {
      const normal = [0, 1, 0];
      const v = [0, 1, 0];
      const l = [0, 1, 0];
      const G = smithGGX(normal, v, l, 0.5);
      assert.ok(G >= 0 && G <= 1);
    });

    it("returns 1 for aligned vectors", () => {
      const normal = [0, 1, 0];
      const v = [0, 1, 0];
      const l = [0, 1, 0];
      const G = smithGGX(normal, v, l, 0.5);
      assert.ok(Math.abs(G - 1) < 1e-6);
    });

    it("decreases at grazing angles", () => {
      const normal = [0, 1, 0];
      const v = [0.999, 0.045, 0];
      const l = [0, 1, 0];
      const G = smithGGX(normal, v, l, 0.5);
      assert.ok(G < 1);
    });
  });

  describe("disneyBRDF — Placeholder BRDF", () => {
    it("returns valid structure", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      const result = disneyBRDF(
        [0, 1, 0], [0, -1, 0], [0, 1, 0],
        { albedo: [0.8, 0.8, 0.8] },
        rng
      );
      
      assert.ok(Array.isArray(result.f));
      assert.equal(result.f.length, 3);
      assert.ok(typeof result.pdf === "number");
    });
  });

  describe("sampleDiffuse / sampleGGX", () => {
    it("sampleDiffuse returns valid vectors", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      const normal = [0, 1, 0];
      
      for (let i = 0; i < 10; i++) {
        const v = sampleDiffuse(rng, normal);
        assert.ok(Math.abs(V3.length(v) - 1) < 1e-6);
      }
    });

    it("sampleGGX returns valid vectors", () => {
      const rng = new PhotorealRNG(0x5EED4D00);
      const normal = [0, 1, 0];
      
      for (let i = 0; i < 10; i++) {
        const v = sampleGGX(rng, normal, 0.5);
        assert.ok(Math.abs(V3.length(v) - 1) < 1e-6);
      }
    });
  });
});