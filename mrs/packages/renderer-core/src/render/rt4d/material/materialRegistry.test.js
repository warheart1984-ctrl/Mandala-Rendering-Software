import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MaterialRegistry, rt4dMaterialToLegacyParams } from "./MaterialRegistry.js";

describe("MaterialRegistry", () => {
  it("registers universal material entries deterministically", () => {
    const registry = new MaterialRegistry();
    registry.register({
      id: "skin-a",
      kind: "skin",
      params: { baseColor: [0.7, 0.42, 0.31], roughness: 0.48 },
    });

    assert.equal(registry.get("skin-a").kind, "skin");
    assert.equal(registry.get("missing").id, "default");
    assert.deepEqual(registry.entries().map((entry) => entry.id), ["default", "skin-a"]);
  });

  it("maps metal/glass to legacy GGX and emissive to light", () => {
    assert.equal(rt4dMaterialToLegacyParams({ id: "m", kind: "metal", params: {} }).type, "ggx");
    assert.equal(rt4dMaterialToLegacyParams({ id: "g", kind: "glass", params: {} }).type, "ggx");
    assert.equal(rt4dMaterialToLegacyParams({ id: "e", kind: "emissive", params: { emissive: [4, 3, 2] } }).type, "light");
  });

  it("preserves advanced BRDF intent for skin, hair, cloth, glass, and procedural materials", () => {
    const registry = new MaterialRegistry([
      { id: "skin", kind: "skin", params: {} },
      { id: "hair", kind: "hair", params: {} },
      { id: "cloth", kind: "cloth", params: {} },
      { id: "glass", kind: "glass", params: {} },
      { id: "glyph", kind: "sovereign-glyph", params: {} },
    ]);

    assert.equal(registry.get("skin").params.brdf, "skin");
    assert.equal(registry.get("skin").params.subsurface, 0.35);
    assert.equal(registry.get("hair").params.anisotropy, 0.8);
    assert.equal(registry.get("cloth").params.anisotropy, 0.35);
    assert.equal(registry.get("glass").params.transmission, 1);
    assert.equal(registry.get("glyph").params.proceduralPalette, "sovereign-glyph");
    assert.equal(rt4dMaterialToLegacyParams(registry.get("skin")).type, "skin");
    assert.equal(rt4dMaterialToLegacyParams(registry.get("hair")).type, "hair");
    assert.equal(rt4dMaterialToLegacyParams(registry.get("cloth")).type, "cloth");
    assert.equal(rt4dMaterialToLegacyParams(registry.get("glyph")).type, "procedural");
  });
});
