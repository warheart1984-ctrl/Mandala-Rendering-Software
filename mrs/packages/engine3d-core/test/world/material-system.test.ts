import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRt4dMaterialTable,
  hashMaterialTable,
  materialToRt4dEntry,
  normalizeUniversalMaterial,
  validateUniversalMaterials,
} from "../../src/world/MaterialSystem.js";
import { createUniversalMaterial } from "../../src/world/WorldObject.js";

describe("MaterialSystem", () => {
  it("normalizes and maps universal materials to RT4D BRDF entries", () => {
    const skin = materialToRt4dEntry(createUniversalMaterial({ id: "skin", type: "skin", baseColor: [0.7, 0.4, 0.3] }));
    const hair = materialToRt4dEntry(createUniversalMaterial({ id: "hair", type: "hair" }));
    const glass = materialToRt4dEntry(createUniversalMaterial({ id: "glass", type: "glass" }));
    const neon = materialToRt4dEntry(createUniversalMaterial({ id: "neon", type: "neon-grid", emissive: [2, 1, 3] }));

    assert.equal(skin.params.brdf, "skin");
    assert.equal(skin.params.subsurface, 0.35);
    assert.equal(hair.params.brdf, "hair");
    assert.equal(hair.params.anisotropy, 0.8);
    assert.equal(glass.params.brdf, "dielectric");
    assert.equal(glass.params.transmission, 1);
    assert.equal(neon.params.brdf, "procedural");
    assert.equal(neon.params.proceduralPalette, "neon-grid");
  });

  it("builds deterministic sorted material tables and hashes", () => {
    const a = createUniversalMaterial({ id: "a", type: "metal" });
    const b = createUniversalMaterial({ id: "b", type: "wood" });
    assert.deepEqual(buildRt4dMaterialTable([b, a]).map((entry) => entry.id), ["a", "b"]);
    assert.equal(hashMaterialTable([a, b]), hashMaterialTable([b, a]));
  });

  it("validates duplicate ids, ranges, and duplicate texture refs", () => {
    const bad = normalizeUniversalMaterial({
      id: "mat",
      type: "basic",
      roughness: 2,
      metallic: -1,
      textureRefs: [{ id: "tex", role: "color" }, { id: "tex", role: "color" }],
    });
    const result = validateUniversalMaterials([{ ...bad, roughness: 2, metallic: -1 }, { ...bad }]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), [
      "invalid-roughness",
      "invalid-metallic",
      "duplicate-texture-ref",
      "duplicate-material-id",
      "duplicate-texture-ref",
    ]);
  });

  it("validates material texture refs against a governed texture catalog", () => {
    const material = createUniversalMaterial({
      id: "mat",
      type: "basic",
      textureRefs: [{ id: "missing", role: "normal" }],
    });
    const result = validateUniversalMaterials([material], []);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), ["unknown-texture-ref"]);
  });
});
