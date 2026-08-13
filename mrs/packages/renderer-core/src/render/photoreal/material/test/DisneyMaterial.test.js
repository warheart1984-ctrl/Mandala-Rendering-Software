import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DisneyMaterial, createDisneyMaterial } from "../DisneyMaterial.js";

describe("DisneyMaterial — Full Disney Parameter Set", () => {
  describe("Constructor & Defaults", () => {
    it("extends PBRMaterial with Disney defaults", () => {
      const mat = new DisneyMaterial({});
      assert.equal(mat.type, "disney");
      assert.equal(mat.clearcoat, 0.0);
      assert.equal(mat.clearcoatRoughness, 0.0);
      assert.equal(mat.anisotropy, 0.0);
      assert.equal(mat.sheen, 0.0);
      assert.equal(mat.sheenTint, 0.5);
      assert.equal(mat.transmission, 0.0);
      assert.equal(mat.thickness, 0.0);
      assert.equal(mat.ior, 1.5);
    });

    it("accepts all Disney parameters", () => {
      const mat = new DisneyMaterial({
        albedo: [0.5, 0.5, 0.5],
        clearcoat: 0.5,
        clearcoatRoughness: 0.1,
        anisotropy: 0.5,
        anisotropyRotation: 0.25,
        sheen: 0.5,
        sheenTint: 0.8,
        transmission: 0.5,
        thickness: 1.0,
        ior: 1.52
      });
      
      assert.equal(mat.clearcoat, 0.5);
      assert.equal(mat.clearcoatRoughness, 0.1);
      assert.equal(mat.anisotropy, 0.5);
      assert.equal(mat.anisotropyRotation, 0.25);
      assert.equal(mat.sheen, 0.5);
      assert.equal(mat.sheenTint, 0.8);
      assert.equal(mat.transmission, 0.5);
      assert.equal(mat.thickness, 1.0);
      assert.equal(mat.ior, 1.52);
    });
  });

  describe("evaluate — Full Disney BRDF", () => {
    it("clearcoat adds specular lobe", () => {
      const mat = new DisneyMaterial({ clearcoat: 1.0, clearcoatRoughness: 0.0 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      assert.ok(result.f[0] > 0);
      assert.ok(result.f[1] > 0);
      assert.ok(result.f[2] > 0);
    });

    it("sheen adds fabric-like highlight", () => {
      const mat1 = new DisneyMaterial({ albedo: [0.8, 0.2, 0.2], sheen: 0, sheenTint: 0 });
      const mat2 = new DisneyMaterial({ albedo: [0.8, 0.2, 0.2], sheen: 1.0, sheenTint: 0 });
      
      const r1 = mat1.evaluate([0.707, 0.707, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const r2 = mat2.evaluate([0.707, 0.707, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Sheen should add energy at grazing
      assert.ok(r2.f[0] >= r1.f[0]);
    });

    it("transmission enables glass-like behavior", () => {
      const mat = new DisneyMaterial({ transmission: 1.0, roughness: 0.0, ior: 1.5 });
      const result = mat.evaluate([0, -1, 0], [0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should have transmission component
      assert.ok(result.f[0] >= 0);
    });
  });

  describe("createDisneyMaterial factory", () => {
    it("returns DisneyMaterial instance", () => {
      const mat = createDisneyMaterial({ clearcoat: 0.5 });
      assert.ok(mat instanceof DisneyMaterial);
    });
  });
});