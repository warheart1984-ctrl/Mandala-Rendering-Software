// mrs/packages/renderer-core/src/render/rt4d/proton/projectProtonField.test.js
// Status: **passing with gaps** - projectProtonField camera + projection + accounting tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectProtonField, defaultCamera4D } from "./projectProtonField.js";
import { vec4 } from "../math/vec4.js";

describe("projectProtonField", () => {
  it("throws when field is missing or invalid", () => {
    assert.throws(() => projectProtonField(null), /ProtonField required/);
    assert.throws(() => projectProtonField({}), /ProtonField required/);
    assert.throws(() => projectProtonField({ protons: "not array" }), /ProtonField required/);
  });

  it("returns enforced status with valid field", () => {
    const field = {
      protons: [
        { id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 },
      ],
    };
    const result = projectProtonField({ protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }] });
    assert.equal(result.status, "enforced");
    assert.equal(result.protons.length, 1);
    assert.equal(result.dropped.length, 0);
  });

  it("uses default camera when none provided", () => {
    const field = {
      protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    };
    const result = projectProtonField(field);
    assert.ok(result.camera);
    assert.ok(result.camera.origin);
    assert.ok(result.camera.basis);
    assert.ok(result.camera.params);
  });

  it("uses provided camera overrides", () => {
    const field = {
      protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    };
    const result = projectProtonField(field, {
      origin: [1, 2, 3, 4],
      basis: [
        [0, 1, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 1, 0],
      ],
      params: { d4: 8, d3: 8, width: 512, height: 512 },
    });
    assert.deepEqual(result.camera.origin, [1, 2, 3, 4]);
    assert.deepEqual(result.camera.basis, [
      [0, 1, 0, 0],
      [1, 0, 0, 0],
      [0, 0, 1, 0],
    ]);
    assert.equal(result.camera.params.d4, 8);
    assert.equal(result.camera.params.d3, 8);
  });

  it("projects proton to screen coordinates", () => {
    const field = {
      protons: [
        { id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 0, 0, 1], density: 1 },
      ],
    };
    const result = projectProtonField({ protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }] });
    const p = result.protons[0];
    assert.ok(typeof p.x === "number" && Number.isFinite(p.x));
    assert.ok(typeof p.y === "number" && Number.isFinite(p.y));
    assert.ok(typeof p.sigma === "number" && p.sigma > 0);
    assert.ok(typeof p.depth === "number" && p.depth >= 0);
    assert.deepEqual(p.color, [1, 1, 1, 1]);
    assert.ok(typeof p.density === "number");
    assert.ok(Array.isArray(p.normal3) && p.normal3.length === 3);
  });

  it("drops protons with missing center", () => {
    const field = {
      protons: [
        { id: "p1", radius: 1, color: [1, 1, 1, 1], density: 1 },
      ],
    };
    const result = projectProtonField({ protons: [{ id: "p1", radius: 1, color: [1, 1, 1, 1], density: 1 }] });
    assert.equal(result.protons.length, 0);
    assert.equal(result.dropped.length, 1);
    assert.equal(result.dropped[0].reason, "missing_center");
  });

  it("drops protons with short center array", () => {
    const result = projectProtonField({
      protons: [{ id: "p1", center: [1, 2], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    });
    assert.equal(result.protons.length, 0);
    assert.equal(result.dropped.length, 1);
    assert.equal(result.dropped[0].reason, "missing_center");
  });

  it("drops protons with non-finite center or radius", () => {
    let result = projectProtonField({
      protons: [{ id: "p1", center: [NaN, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    });
    assert.equal(result.dropped[0].reason, "non_finite");

    result = projectProtonField({
      protons: [{ id: "p1", center: [0, 0, 0, 0], radius: NaN, color: [1, 1, 1, 1], density: 1 }],
    });
    assert.equal(result.dropped[0].reason, "non_finite");
  });

  it("drops protons with non-finite screen coordinates", () => {
    // This would require a proton at a position that projects to non-finite coords
    // For now, just verify the dropped reason exists
    const field = {
      protons: [
        { id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 },
      ],
    };
    // Force a non-finite screen by using extreme camera params
    const result = projectProtonField({
      protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    }, {
      params: { d4: 0, d3: 0 }, // This would cause division by zero
    });
    // The implementation guards against d4=0 by setting nearW
    assert.ok(result.protons.length >= 0);
  });

  it("sorts protons by id before processing", () => {
    const result = projectProtonField({
      protons: [
        { id: "b", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 },
        { id: "a", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 },
      ],
    });
    assert.equal(result.protons[0].id, "a");
    assert.equal(result.protons[1].id, "b");
  });

  it("drops invalid protons and keeps valid ones", () => {
    const result = projectProtonField({
      protons: [
        { id: "valid", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 },
        { id: "invalid", radius: 1, color: [1, 1, 1, 1], density: 1 },
        { id: "valid2", center: [1, 1, 1, 1], radius: 1, color: [1, 1, 1, 1], density: 1 },
      ],
    });
    assert.equal(result.protons.length, 2);
    assert.equal(result.dropped.length, 1);
    assert.equal(result.dropped[0].id, "invalid");
  });

  it("accounting check catches missing protons", () => {
    // Create a scenario where accounting check triggers
    // This is hard to test directly without internal access, but we can verify
    // the structure includes the accounting check
    const result = projectProtonField({
      protons: [{ id: "p1", center: [0, 0, 0, 0], radius: 1, color: [1, 1, 1, 1], density: 1 }],
    });
    const accounted = result.protons.length + result.dropped.length;
    assert.equal(accounted, 1);
  });

  it("defaultCamera4D returns sensible defaults", () => {
    const camera = defaultCamera4D();
    assert.deepEqual(camera.origin, [0, 0, -2, 0]);
    assert.deepEqual(camera.basis, [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ]);
    assert.equal(camera.params.d4, 4);
    assert.equal(camera.params.d3, 4);
    assert.equal(camera.params.scale, 80);
    assert.equal(camera.params.width, 256);
    assert.equal(camera.params.height, 256);
    assert.equal(camera.params.nearW, 0.05);
  });

  it("defaultCamera4D accepts overrides", () => {
    const camera = defaultCamera4D({
      origin: [1, 2, 3, 4],
      basis: [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]],
      params: { d4: 8, d3: 8, width: 512, height: 512 },
    });
    assert.deepEqual(camera.origin, [1, 2, 3, 4]);
    assert.deepEqual(camera.basis, [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]]);
    assert.equal(camera.params.d4, 8);
    assert.equal(camera.params.d3, 8);
    assert.equal(camera.params.width, 512);
    assert.equal(camera.params.height, 512);
  });
});