import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MaterialRegistry, materialRegistry, createMaterial, getMaterial, registerMaterial } from "../index.js";
import { PBRMaterial } from "../PBRMaterial.js";
import { ConductorMaterial } from "../ConductorMaterial.js";
import { GlassMaterial } from "../GlassMaterial.js";
import { SubsurfaceMaterial } from "../SubsurfaceMaterial.js";

describe("MaterialRegistry — Registry & Presets", () => {
  let registry;

  describe("Registry Instance", () => {
    it("creates independent registry", () => {
      registry = new MaterialRegistry();
      assert.ok(registry instanceof MaterialRegistry);
      assert.ok(registry.materials instanceof Map);
    });

    it("registers default presets on construction", () => {
      registry = new MaterialRegistry();
      
      assert.ok(registry.has("default"));
      assert.ok(registry.has("gold"));
      assert.ok(registry.has("silver"));
      assert.ok(registry.has("copper"));
      assert.ok(registry.has("glass"));
      assert.ok(registry.has("water"));
      assert.ok(registry.has("skin"));
    });

    it("default is PBRMaterial", () => {
      registry = new MaterialRegistry();
      const mat = registry.get("default");
      assert.ok(mat instanceof PBRMaterial);
    });

    it("gold/silver/copper are ConductorMaterial", () => {
      registry = new MaterialRegistry();
      assert.ok(registry.get("gold") instanceof ConductorMaterial);
      assert.ok(registry.get("silver") instanceof ConductorMaterial);
      assert.ok(registry.get("copper") instanceof ConductorMaterial);
    });

    it("glass/water are GlassMaterial", () => {
      registry = new MaterialRegistry();
      assert.ok(registry.get("glass") instanceof GlassMaterial);
      assert.ok(registry.get("water") instanceof GlassMaterial);
    });

    it("skin is SubsurfaceMaterial", () => {
      registry = new MaterialRegistry();
      assert.ok(registry.get("skin") instanceof SubsurfaceMaterial);
    });
  });

  describe("register / get / has / list", () => {
    it("register adds material", () => {
      registry = new MaterialRegistry();
      const mat = new PBRMaterial({ materialId: "test-mat", albedo: [1, 0, 0] });
      registry.register("test-mat", mat);
      
      assert.ok(registry.has("test-mat"));
      assert.strictEqual(registry.get("test-mat"), mat);
    });

    it("get returns undefined for missing", () => {
      registry = new MaterialRegistry();
      assert.equal(registry.get("nonexistent"), undefined);
    });

    it("list returns all registered IDs", () => {
      registry = new MaterialRegistry();
      const list = registry.list();
      assert.ok(Array.isArray(list));
      assert.ok(list.includes("default"));
      assert.ok(list.includes("gold"));
    });
  });

  describe("create — Factory Method", () => {
    it("creates PBRMaterial by type", () => {
      registry = new MaterialRegistry();
      const mat = registry.create("pbr", { albedo: [0.5, 0.5, 0.5], materialId: "test-pbr" });
      assert.ok(mat instanceof PBRMaterial);
      assert.ok(registry.has("test-pbr"));
    });

    it("creates ConductorMaterial by type", () => {
      registry = new MaterialRegistry();
      const mat = registry.create("conductor", { preset: "gold", materialId: "test-gold" });
      assert.ok(mat instanceof ConductorMaterial);
    });

    it("creates GlassMaterial by type", () => {
      registry = new MaterialRegistry();
      const mat = registry.create("glass", { ior: 1.5, materialId: "test-glass" });
      assert.ok(mat instanceof GlassMaterial);
    });

    it("creates SubsurfaceMaterial by type", () => {
      registry = new MaterialRegistry();
      const mat = registry.create("subsurface", { scatteringDistance: 1.0, materialId: "test-skin" });
      assert.ok(mat instanceof SubsurfaceMaterial);
    });

    it("throws for unknown type", () => {
      registry = new MaterialRegistry();
      assert.throws(() => registry.create("unknown", {}), /Unknown material type/);
    });
  });

  describe("Global Singleton", () => {
    it("materialRegistry is shared instance", () => {
      assert.ok(materialRegistry instanceof MaterialRegistry);
      assert.ok(materialRegistry.has("default"));
    });

    it("createMaterial uses global registry", () => {
      const mat = createMaterial("pbr", { materialId: "global-test", albedo: [0.1, 0.2, 0.3] });
      assert.ok(mat instanceof PBRMaterial);
      assert.ok(materialRegistry.has("global-test"));
    });

    it("getMaterial uses global registry", () => {
      const mat = getMaterial("gold");
      assert.ok(mat instanceof ConductorMaterial);
    });

    it("registerMaterial uses global registry", () => {
      const mat = new PBRMaterial({ materialId: "global-reg", albedo: [0.9, 0.9, 0.9] });
      registerMaterial("global-reg", mat);
      assert.ok(materialRegistry.has("global-reg"));
    });
  });
});