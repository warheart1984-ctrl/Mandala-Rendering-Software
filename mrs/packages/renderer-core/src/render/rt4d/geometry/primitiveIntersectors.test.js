import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SdfPrimitiveIntersector } from "./PrimitiveIntersectors.js";
import { Scene4D } from "../scene/Scene4D.js";
import { vec4 } from "../math/vec4.js";

const ray = (origin, direction = [0, 0, 1]) => ({
  origin: vec4(origin[0], origin[1], origin[2], 0),
  direction: vec4(direction[0], direction[1], direction[2], 0),
  tMin: 0.001,
  tMax: 100,
});

describe("SdfPrimitiveIntersector", () => {
  for (const kind of ["cylinder", "capsule", "cone", "torus", "superquadric"]) {
    it(`intersects ${kind}`, () => {
      const primitive = {
        kind,
        center: [0, 0, 4],
        radius: 1,
        height: 2,
        majorRadius: 1,
        minorRadius: 0.25,
        exponent: 4,
        materialId: `${kind}-mat`,
      };
      const hit = new SdfPrimitiveIntersector(primitive).intersect(ray([0.5, 0, 0]));
      assert.ok(hit, `expected ${kind} hit`);
      assert.equal(hit.materialId, `${kind}-mat`);
      assert.ok(hit.t > 0);
    });
  }

  it("misses when ray is outside the primitive support", () => {
    const hit = new SdfPrimitiveIntersector({
      kind: "cylinder",
      center: [0, 0, 4],
      radius: 1,
      height: 2,
    }).intersect(ray([5, 0, 0]));
    assert.equal(hit, null);
  });

  it("Scene4D wraps raw bridge primitives for missing geometry types", () => {
    const scene = new Scene4D();
    scene.addPrimitive({ kind: "capsule", center: [0, 0, 4], radius: 0.5, height: 2 }, "capsule-mat");
    const hit = scene.intersect(ray([0, 0, 0]));
    assert.ok(hit);
    assert.equal(hit.materialId, "capsule-mat");
  });
});
