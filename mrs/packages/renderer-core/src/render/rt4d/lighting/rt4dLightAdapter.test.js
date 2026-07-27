import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { environmentToEmission, normalizeRt4dLight, sampleRt4dLight } from "./Rt4dLightAdapter.js";
import { vec4 } from "../math/vec4.js";

describe("Rt4dLightAdapter", () => {
  it("normalizes governed directional, point, spot, area, and environment lights", () => {
    for (const type of ["directional", "point", "spot", "area", "environment"]) {
      const light = normalizeRt4dLight({ id: type, type, color: [1, 0.5, 0.25], intensity: 2, position: [0, 2, 0] });
      assert.equal(light.id, type);
      assert.equal(light.type, type);
      assert.equal(light.intensity, 2);
    }
  });

  it("generates deterministic light IDs when no id provided", () => {
    const light1 = normalizeRt4dLight({ type: "point", color: [1, 1, 1], intensity: 1 });
    const light2 = normalizeRt4dLight({ type: "point", color: [1, 1, 1], intensity: 1 });
    const light3 = normalizeRt4dLight({ type: "point", color: [1, 1, 1], intensity: 1 });
    assert.equal(light1.id, "point-0");
    assert.equal(light2.id, "point-1");
    assert.equal(light3.id, "point-2");
  });

  it("samples point and directional lights toward a hit", () => {
    const hit = { position: vec4(0, 0, 0, 0) };
    const point = sampleRt4dLight({ id: "p", type: "point", color: [1, 1, 1], intensity: 4, position: [0, 0, 2] }, hit);
    const directional = sampleRt4dLight({ id: "d", type: "directional", color: [1, 1, 1], intensity: 1, direction: [0, 0, -1] }, hit);
    assert.ok(point);
    assert.ok(Math.abs(point.wo.z - 1) < 1e-6);
    assert.ok(directional);
    assert.ok(Math.abs(directional.wo.z - 1) < 1e-6);
  });

  it("maps environment presets to emission", () => {
    const emission = environmentToEmission({ preset: "cosmic", color: [0.2, 0.3, 1], intensity: 2 });
    assert.equal(emission.x, 0.4);
    assert.equal(emission.z, 2);
  });
});
