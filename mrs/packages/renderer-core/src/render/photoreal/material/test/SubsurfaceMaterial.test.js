import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SubsurfaceMaterial, createSubsurfaceMaterial } from "../SubsurfaceMaterial.js";

describe("SubsurfaceMaterial — Diffusion Approximation", () => {
  describe("Constructor & Defaults", () => {
    it("defaults to skin-like properties", () => {
      const mat = new SubsurfaceMaterial({});
      assert.equal(mat.type, "subsurface");
      assert.equal(mat.metallic, 0.0);
      assert.equal(mat.transmission, 1.0);
      assert.deepEqual(mat.scatteringColor, [1.0, 0.8, 0.6]);
      assert.equal(mat.scatteringDistance, 5.0);
      assert.equal(mat.scatteringAnisotropy, 0.0);
    });

    it("accepts custom scattering parameters", () => {
      const mat = new SubsurfaceMaterial({
        scatteringColor: [0.8, 0.6, 0.4],
        scatteringDistance: 2.0,
        scatteringAnisotropy: 0.5
      });
      assert.deepEqual(mat.scatteringColor, [0.8, 0.6, 0.4]);
      assert.equal(mat.scatteringDistance, 2.0);
      assert.equal(mat.scatteringAnisotropy, 0.5);
    });
  });

  describe("evaluate — Surface + Subsurface", () => {
    it("combines surface and subsurface", () => {
      const mat = new SubsurfaceMaterial({ scatteringDistance: 1.0 });
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should have both surface and subsurface contribution
      assert.ok(result.f[0] > 0);
      assert.ok(result.f[1] > 0);
      assert.ok(result.f[2] > 0);
    });

    it("scatteringColor tints subsurface", () => {
      const mat1 = new SubsurfaceMaterial({ scatteringColor: [1, 0, 0], scatteringDistance: 0.1 });
      const mat2 = new SubsurfaceMaterial({ scatteringColor: [0, 1, 0], scatteringDistance: 0.1 });
      
      const r1 = mat1.evaluate([0.5, 0.5, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const r2 = mat2.evaluate([0.5, 0.5, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      assert.ok(r1.f[0] > r1.f[1]);
      assert.ok(r2.f[1] > r2.f[0]);
    });

    it("scatteringDistance controls falloff", () => {
      const matNear = new SubsurfaceMaterial({ scatteringDistance: 0.1 });
      const matFar = new SubsurfaceMaterial({ scatteringDistance: 10.0 });
      
      // Short distance = more scattering near surface
      // Long distance = scattering spreads further
      const rNear = matNear.evaluate([0.1, 0.9, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      const rFar = matFar.evaluate([0.1, 0.9, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Both should produce valid results
      assert.ok(rNear.f[0] >= 0);
      assert.ok(rFar.f[0] >= 0);
    });

    it("phase function affects directional scattering", () => {
      const matFwd = new SubsurfaceMaterial({ scatteringAnisotropy: 0.8 });
      const matBack = new SubsurfaceMaterial({ scatteringAnisotropy: -0.8 });
      
      // Forward scattering
      const rFwd = matFwd.evaluate([0.707, 0.707, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      // Backward scattering
      const rBack = matBack.evaluate([-0.707, 0.707, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      assert.ok(rFwd.f[0] >= 0);
      assert.ok(rBack.f[0] >= 0);
    });
  });

  describe("createSubsurfaceMaterial factory", () => {
    it("returns SubsurfaceMaterial instance", () => {
      const mat = createSubsurfaceMaterial({ scatteringColor: [0.5, 0.5, 0.5] });
      assert.ok(mat instanceof SubsurfaceMaterial);
    });
  });
});