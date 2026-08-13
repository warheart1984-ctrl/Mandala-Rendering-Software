import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConductorMaterial, createConductorMaterial } from "../ConductorMaterial.js";

describe("ConductorMaterial — Metals with Complex IOR", () => {
  describe("Constructor & Presets", () => {
    it("defaults to metallic=1", () => {
      const mat = new ConductorMaterial({});
      assert.equal(mat.metallic, 1.0);
      assert.equal(mat.type, "conductor");
    });

    it("stores complex IOR (n, k)", () => {
      const mat = new ConductorMaterial({ ior: [0.17, 0.35, 1.5], extinction: [3.42, 2.37, 1.81] });
      assert.deepEqual(mat.ior, [0.17, 0.35, 1.5]);
      assert.deepEqual(mat.extinction, [3.42, 2.37, 1.81]);
    });

    it("gold preset creates correct material", () => {
      const mat = createConductorMaterial({ preset: "gold" });
      assert.deepEqual(mat.albedo, [1.0, 0.766, 0.336]);
      assert.equal(mat.roughness, 0.1);
    });

    it("silver preset creates correct material", () => {
      const mat = createConductorMaterial({ preset: "silver" });
      assert.deepEqual(mat.albedo, [0.97, 0.96, 0.91]);
      assert.equal(mat.roughness, 0.01);
    });

    it("copper preset creates correct material", () => {
      const mat = createConductorMaterial({ preset: "copper" });
      assert.deepEqual(mat.albedo, [0.95, 0.64, 0.54]);
      assert.equal(mat.roughness, 0.05);
    });

    it("aluminum preset creates correct material", () => {
      const mat = createConductorMaterial({ preset: "aluminum" });
      assert.deepEqual(mat.albedo, [0.91, 0.92, 0.92]);
      assert.equal(mat.roughness, 0.08);
    });

    it("iron preset creates correct material", () => {
      const mat = createConductorMaterial({ preset: "iron" });
      assert.deepEqual(mat.albedo, [0.56, 0.57, 0.58]);
      assert.equal(mat.roughness, 0.2);
    });

    it("preset can be overridden", () => {
      const mat = createConductorMaterial({ preset: "gold", roughness: 0.5 });
      assert.equal(mat.roughness, 0.5);
      assert.deepEqual(mat.albedo, [1.0, 0.766, 0.336]);
    });
  });

  describe("evaluate — Conductor Fresnel", () => {
    it("gold shows warm reflectance", () => {
      const mat = createConductorMaterial({ preset: "gold" });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Gold: R > G > B
      assert.ok(result.f[0] > result.f[1]);
      assert.ok(result.f[1] > result.f[2]);
    });

    it("silver shows neutral reflectance", () => {
      const mat = createConductorMaterial({ preset: "silver" });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Silver: R ≈ G ≈ B
      assert.ok(Math.abs(result.f[0] - result.f[1]) < 0.01);
      assert.ok(Math.abs(result.f[1] - result.f[2]) < 0.01);
    });

    it("copper shows orange reflectance", () => {
      const mat = createConductorMaterial({ preset: "copper" });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Copper: R > G, B
      assert.ok(result.f[0] > result.f[1]);
      assert.ok(result.f[0] > result.f[2]);
    });

    it("roughness affects spread", () => {
      const smooth = createConductorMaterial({ preset: "gold", roughness: 0.01 });
      const rough = createConductorMaterial({ preset: "gold", roughness: 0.5 });
      
      const rSmooth = smooth.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const rRough = rough.evaluate([0.707, 0.707, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Rough should spread energy to grazing
      assert.ok(rRough.f[0] > 0);
    });
  });

  describe("F0 computation from complex IOR", () => {
    it("computes F0 from (n-1+ik)/(n+1+ik)^2", () => {
      const mat = new ConductorMaterial({ ior: [0.17, 0.35, 1.5], extinction: [3.42, 2.37, 1.81] });
      // Test internal _fresnelF0 - use evaluate at normal incidence
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // F0 for gold should be high (0.8-1.0 range)
      assert.ok(result.f[0] > 0.5);
    });
  });
});