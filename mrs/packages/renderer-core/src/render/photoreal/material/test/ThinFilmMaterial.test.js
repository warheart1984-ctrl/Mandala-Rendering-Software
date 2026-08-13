import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ThinFilmMaterial, createThinFilmMaterial } from "../ThinFilmMaterial.js";

describe("ThinFilmMaterial — Interference Iridescence", () => {
  describe("Constructor & Defaults", () => {
    it("defaults to soap-bubble-like properties", () => {
      const mat = new ThinFilmMaterial({});
      assert.equal(mat.type, "thinfilm");
      assert.equal(mat.metallic, 0.0);
      assert.equal(mat.transmission, 1.0);
      assert.equal(mat.thickness, 300.0);
      assert.equal(mat.ior, 1.33);
      assert.equal(mat.baseIor, 1.5);
    });

    it("accepts custom thickness and IOR", () => {
      const mat = new ThinFilmMaterial({ thickness: 500, ior: 1.4, baseIor: 1.6 });
      assert.equal(mat.thickness, 500);
      assert.equal(mat.ior, 1.4);
      assert.equal(mat.baseIor, 1.6);
    });
  });

  describe("evaluate — Thin Film Interference", () => {
    it("produces iridescent colors at varying thickness", () => {
      const mat1 = new ThinFilmMaterial({ thickness: 100 });
      const mat2 = new ThinFilmMaterial({ thickness: 300 });
      const mat3 = new ThinFilmMaterial({ thickness: 500 });
      
      const r1 = mat1.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const r2 = mat2.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const r3 = mat3.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Different thicknesses should produce different colors
      assert.notDeepEqual(r1.f, r2.f);
      assert.notDeepEqual(r2.f, r3.f);
    });

    it("thickness variation creates color shifts", () => {
      const mat = new ThinFilmMaterial({ thickness: 300, thicknessVariation: 50 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should have colorful reflection
      assert.ok(result.f[0] >= 0 && result.f[1] >= 0 && result.f[2] >= 0);
    });

    it("film IOR affects interference", () => {
      const matLow = new ThinFilmMaterial({ ior: 1.2, thickness: 300 });
      const matHigh = new ThinFilmMaterial({ ior: 1.8, thickness: 300 });
      
      const rLow = matLow.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const rHigh = matHigh.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      assert.notDeepEqual(rLow.f, rHigh.f);
    });
  });

  describe("createThinFilmMaterial factory", () => {
    it("returns ThinFilmMaterial instance", () => {
      const mat = createThinFilmMaterial({ thickness: 200 });
      assert.ok(mat instanceof ThinFilmMaterial);
    });
  });
});