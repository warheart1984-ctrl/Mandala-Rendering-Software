import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PBRMaterial, createMaterial } from "../PBRMaterial.js";

describe("PBRMaterial — Disney Principled BRDF", () => {
  describe("Constructor & Defaults", () => {
    it("creates material with defaults", () => {
      const mat = new PBRMaterial({});
      assert.deepEqual(mat.albedo, [0.8, 0.8, 0.8]);
      assert.equal(mat.roughness, 0.5);
      assert.equal(mat.metallic, 0.0);
      assert.equal(mat.specular, 0.5);
      assert.equal(mat.clearcoat, 0.0);
      assert.equal(mat.transmission, 0.0);
      assert.equal(mat.ior, 1.5);
      assert.equal(mat.alpha, 1.0);
      assert.equal(mat.type, "pbr");
    });

    it("clamps roughness to [0.001, 1.0]", () => {
      const mat1 = new PBRMaterial({ roughness: -0.5 });
      const mat2 = new PBRMaterial({ roughness: 1.5 });
      assert.equal(mat1.roughness, 0.001);
      assert.equal(mat2.roughness, 1.0);
    });

    it("clamps metallic to [0, 1]", () => {
      const mat1 = new PBRMaterial({ metallic: -1 });
      const mat2 = new PBRMaterial({ metallic: 2 });
      assert.equal(mat1.metallic, 0);
      assert.equal(mat2.metallic, 1);
    });

    it("generates unique materialId", () => {
      const mat1 = new PBRMaterial({});
      const mat2 = new PBRMaterial({});
      assert.notEqual(mat1.materialId, mat2.materialId);
    });

    it("accepts custom materialId", () => {
      const mat = new PBRMaterial({ materialId: "custom-id" });
      assert.equal(mat.materialId, "custom-id");
    });
  });

  describe("evaluate — BSDF Evaluation", () => {
    it("returns { f, pdf } structure", () => {
      const mat = new PBRMaterial({ albedo: [1, 0, 0] });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      assert.ok(Array.isArray(result.f));
      assert.equal(result.f.length, 3);
      assert.ok(typeof result.pdf === "number");
    });

    it("returns zero for backfacing", () => {
      const mat = new PBRMaterial({ albedo: [1, 0, 0] });
      const result = mat.evaluate([0, -1, 0], [0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      assert.deepEqual(result.f, [0, 0, 0]);
      assert.equal(result.pdf, 0);
    });

    it("metallic=0 gives dielectric response", () => {
      const mat = new PBRMaterial({ albedo: [0.8, 0.2, 0.2], metallic: 0, roughness: 0.1 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Dielectric should have specular from F0=0.04
      assert.ok(result.f[0] > 0.001);
    });

    it("metallic=1 gives conductor response", () => {
      const mat = new PBRMaterial({ albedo: [1, 0.8, 0.4], metallic: 1, roughness: 0.1 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Conductor should have colored specular
      assert.ok(result.f[0] > result.f[1]);
      assert.ok(result.f[1] > result.f[2]);
    });
  });

  describe("sample — BSDF Sampling", () => {
    it("returns { wi, f, pdf }", () => {
      const mat = new PBRMaterial({ albedo: [1, 0, 0] });
      const rng = () => 0.5;
      const result = mat.sample([0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0], rng);
      
      assert.ok(Array.isArray(result.wi));
      assert.equal(result.wi.length, 3);
      assert.ok(Array.isArray(result.f));
      assert.ok(typeof result.pdf === "number");
    });

    it("returns normalized wi", () => {
      const mat = new PBRMaterial({ albedo: [1, 0, 0] });
      const rng = () => 0.5;
      const result = mat.sample([0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0], rng);
      
      const len = Math.sqrt(result.wi[0]**2 + result.wi[1]**2 + result.wi[2]**2);
      assert.ok(Math.abs(len - 1) < 1e-4);
    });
  });

  describe("pdf — PDF Query", () => {
    it("returns non-negative value", () => {
      const mat = new PBRMaterial({ albedo: [1, 0, 0] });
      const pdf = mat.pdf([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      assert.ok(pdf >= 0);
    });
  });

  describe("Energy Conservation (sanity)", () => {
    it("rough surfaces don't exceed 1/pi", () => {
      const mat = new PBRMaterial({ albedo: [1, 1, 1], roughness: 1.0 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const maxComponent = Math.max(...result.f);
      assert.ok(maxComponent <= 1/Math.PI + 1e-3);
    });

    it("smooth metallic conserves energy", () => {
      const mat = new PBRMaterial({ albedo: [0.9, 0.8, 0.4], metallic: 1, roughness: 0.01 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      // Conductor reflection should be <= 1
      assert.ok(result.f[0] <= 1.01);
      assert.ok(result.f[1] <= 1.01);
      assert.ok(result.f[2] <= 1.01);
    });
  });

  describe("createMaterial factory", () => {
    it("returns PBRMaterial instance", () => {
      const mat = createMaterial({ albedo: [0.5, 0.5, 0.5] });
      assert.ok(mat instanceof PBRMaterial);
    });
  });
});