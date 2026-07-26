import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUniversalMaterial, createWorldObject } from "../../src/world/WorldObject.js";

describe("WorldObject universal contract", () => {
  it("creates stable primitive world objects with default transform", () => {
    const object = createWorldObject({
      id: "sphere-a",
      kind: "primitive",
      geometry: { primitiveType: "sphere" },
      material: { materialId: "mat-skin" },
    });
    assert.equal(object.kind, "primitive");
    assert.deepEqual(object.transform.position, [0, 0, 0]);
    assert.equal(object.geometry?.primitiveType, "sphere");
    assert.equal(object.material?.materialId, "mat-skin");
  });

  it("normalizes universal material defaults", () => {
    const material = createUniversalMaterial({ id: "mat-hair", type: "hair" });
    assert.equal(material.id, "mat-hair");
    assert.equal(material.type, "hair");
    assert.deepEqual(material.baseColor, [0.8, 0.8, 0.8]);
    assert.equal(material.roughness, 0.7);
    assert.deepEqual(material.textureRefs, []);
  });
});
