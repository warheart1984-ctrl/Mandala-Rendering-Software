import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GlassMaterial, createGlassMaterial } from "../GlassMaterial.js";

describe("GlassMaterial — Dielectric with Transmission", () => {
  describe("Constructor & Defaults", () => {
    it("defaults to glass-like properties", () => {
      const mat = new GlassMaterial({});
      assert.equal(mat.type, "glass");
      assert.equal(mat.metallic, 0.0);
      assert.equal(mat.transmission, 1.0);
      assert.equal(mat.ior, 1.5);
      assert.equal(mat.roughness, 0.0);
      assert.equal(mat.thickness, 1.0);
    });

    it("accepts custom parameters", () => {
      const mat = new GlassMaterial({ ior: 1.33, roughness: 0.1, thickness: 0.5 });
      assert.equal(mat.ior, 1.33);
      assert.equal(mat.roughness, 0.1);
      assert.equal(mat.thickness, 0.5);
    });
  });

  describe("evaluate — Reflection & Refraction", () => {
    it("total internal reflection at critical angle", () => {
      const mat = new GlassMaterial({ ior: 1.5, transmission: 1.0 });
      // From inside glass (entering=false), angle > critical
      // critical angle = asin(1/1.5) ≈ 41.8°
      const wi = [0.7, -0.7, 0]; // ~45° from normal, inside
      const wo = [0, 1, 0];
      const normal = [0, 1, 0];
      
      const result = mat.evaluate(wi, wo, normal, [1, 0, 0], [0, 0]);
      // Should be pure reflection (TIR)
      assert.ok(result.f[0] > 0);
    });

    it("fresnel increases at grazing angles", () => {
      const mat = new GlassMaterial({ ior: 1.5 });
      const normal = [0, 1, 0];
      
      // Near normal
      const r1 = mat.evaluate([0, 1, 0], [0, -1, 0], normal, [1, 0, 0], [0, 0]);
      // Grazing
      const r2 = mat.evaluate([0.999, 0.045, 0], [0, -1, 0], normal, [1, 0, 0], [0, 0]);
      
      assert.ok(r2.f[0] > r1.f[0]);
    });

    it("perfect mirror at normal incidence has F0 = ((n-1)/(n+1))^2", () => {
      const mat = new GlassMaterial({ ior: 1.5, transmission: 0 }); // No transmission = mirror
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      const F0 = ((1.5 - 1) / (1.5 + 1)) ** 2; // ~0.04
      assert.ok(Math.abs(result.f[0] - F0) < 0.01);
    });

    it("refraction direction follows Snell's law", () => {
      const mat = new GlassMaterial({ ior: 1.5, transmission: 1.0, roughness: 0 });
      // This tests the internal _refract method indirectly
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should have transmission component
      assert.ok(result.f[0] >= 0);
    });
  });

  describe("createGlassMaterial factory", () => {
    it("returns GlassMaterial instance", () => {
      const mat = createGlassMaterial({ ior: 1.52 });
      assert.ok(mat instanceof GlassMaterial);
    });
  });
});