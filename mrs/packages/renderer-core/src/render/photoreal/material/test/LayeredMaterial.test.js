import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LayeredMaterial, createLayeredMaterial } from "../LayeredMaterial.js";
import { PBRMaterial } from "../PBRMaterial.js";
import { ConductorMaterial } from "../ConductorMaterial.js";

describe("LayeredMaterial — Multi-layer Blending", () => {
  describe("Constructor & Layers", () => {
    it("creates layered material with multiple layers", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 0.5 },
          { type: "pbr", albedo: [0, 1, 0], weight: 0.5 }
        ]
      });
      
      assert.equal(mat.layers.length, 2);
      assert.ok(mat.layers[0].material instanceof PBRMaterial);
      assert.ok(mat.layers[1].material instanceof PBRMaterial);
      assert.equal(mat.layers[0].weight, 0.5);
      assert.equal(mat.layers[1].weight, 0.5);
    });

    it("supports different material types in layers", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "conductor", preset: "gold", weight: 0.7 },
          { type: "pbr", albedo: [0, 0, 1], weight: 0.3 }
        ],
        base: { albedo: [0.5, 0.5, 0.5] }
      });
      
      assert.ok(mat.layers[0].material instanceof ConductorMaterial);
      assert.ok(mat.layers[1].material instanceof PBRMaterial);
      assert.ok(mat.base instanceof PBRMaterial);
    });

    it("supports blend modes", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 0.5, blendMode: "add" },
          { type: "pbr", albedo: [0, 1, 0], weight: 0.5, blendMode: "multiply" }
        ]
      });
      
      assert.equal(mat.layers[0].blendMode, "add");
      assert.equal(mat.layers[1].blendMode, "multiply");
    });
  });

  describe("evaluate — Layer Blending", () => {
    it("mix mode blends layers", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 0.5, blendMode: "mix" },
          { type: "pbr", albedo: [0, 1, 0], weight: 0.5, blendMode: "mix" }
        ],
        base: { albedo: [0, 0, 0] }
      });
      
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should blend red and green to yellow-ish
      assert.ok(result.f[0] > 0);
      assert.ok(result.f[1] > 0);
      assert.ok(result.f[2] >= 0);
    });

    it("add mode sums layers", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 1.0, blendMode: "add" },
          { type: "pbr", albedo: [0, 1, 0], weight: 1.0, blendMode: "add" }
        ],
        base: { albedo: [0, 0, 0] }
      });
      
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Add should increase brightness
      assert.ok(result.f[0] > 0.5);
      assert.ok(result.f[1] > 0.5);
    });

    it("weights normalize if not summing to 1", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 2.0 },
          { type: "pbr", albedo: [0, 1, 0], weight: 2.0 }
        ],
        base: { albedo: [0, 0, 0] }
      });
      
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Should be normalized to 0.5 each
      assert.ok(result.f[0] > 0);
      assert.ok(result.f[1] > 0);
    });

    it("base material contributes", () => {
      const mat = new LayeredMaterial({
        layers: [{ type: "pbr", albedo: [1, 0, 0], weight: 0.5 }],
        base: { albedo: [0, 0, 1] }
      });
      
      const result = mat.evaluate([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      
      // Base (blue) should contribute
      assert.ok(result.f[2] > 0);
    });
  });

  describe("sample — Dominant Layer Sampling", () => {
    it("samples from dominant layer", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 0.9 },
          { type: "pbr", albedo: [0, 1, 0], weight: 0.1 }
        ]
      });
      
      const rng = () => 0.5;
      const result = mat.sample([0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0], rng);
      
      assert.ok(Array.isArray(result.wi));
      assert.ok(typeof result.pdf === "number");
    });
  });

  describe("pdf — Max Across Layers", () => {
    it("returns maximum PDF", () => {
      const mat = new LayeredMaterial({
        layers: [
          { type: "pbr", albedo: [1, 0, 0], weight: 1.0 },
          { type: "pbr", albedo: [0, 1, 0], weight: 1.0 }
        ]
      });
      
      const pdf = mat.pdf([0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0]);
      assert.ok(pdf >= 0);
    });
  });

  describe("createLayeredMaterial factory", () => {
    it("returns LayeredMaterial instance", () => {
      const mat = createLayeredMaterial({
        layers: [{ type: "pbr", albedo: [0.5, 0.5, 0.5] }]
      });
      assert.ok(mat instanceof LayeredMaterial);
    });
  });
});