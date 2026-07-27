import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PathTracer4D } from "./PathTracer4D.js";
import { Scene4D } from "../scene/Scene4D.js";
import { vec4 } from "../math/vec4.js";

describe("PathTracer4D governed light/environment consumption", () => {
  it("adds direct contribution from Scene4D RT4D light rig", () => {
    const scene = new Scene4D();
    scene.materials.createMaterial("mat", "lambertian", { albedo: vec4(1, 1, 1, 1) });
    scene.consumeBridgeLighting({
      lightRig: [{ id: "key", type: "directional", color: [1, 1, 1], intensity: 2, direction: [0, 0, -1] }],
      environment: { preset: "void", color: [0, 0, 0], intensity: 0 },
    });
    scene.addPrimitive({
      materialId: "mat",
      intersect: (ray) => ray.origin.z < 0
        ? { t: 1, position: vec4(0, 0, 0, 0), normal: vec4(0, 0, 1, 0), materialId: "mat" }
        : null,
    }, "mat");
    const color = new PathTracer4D({ maxDepth: 1, rng: () => 0 }).trace({
      origin: vec4(0, 0, -1, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 10,
    }, scene);
    assert.ok(color.x > 0);
    assert.ok(color.y > 0);
    assert.ok(color.z > 0);
  });

  it("returns governed environment emission on miss", () => {
    const scene = new Scene4D().setRt4dEnvironment({ preset: "cosmic", color: [0.2, 0.3, 1], intensity: 2 });
    const color = new PathTracer4D({ maxDepth: 1 }).trace({
      origin: vec4(0, 0, -1, 0),
      direction: vec4(0, 1, 0, 0),
      tMin: 0.001,
      tMax: 10,
    }, scene);
    assert.equal(color.x, 0.4);
    assert.equal(color.z, 2);
  });

  it("treats analytic light-rig lights as delta for BSDF MIS (light PDF is 0)", () => {
    const scene = new Scene4D();
    scene.materials.createMaterial("mat", "lambertian", { albedo: vec4(1, 1, 1, 1) });
    scene.consumeBridgeLighting({
      lightRig: [
        { id: "sun", type: "directional", color: [1, 1, 1], intensity: 1, direction: [0, -1, 0] },
        { id: "lamp", type: "point", color: [1, 1, 1], intensity: 4, position: [0, 2, 0] },
      ],
      environment: { preset: "void", color: [0, 0, 0], intensity: 0 },
    });
    const tracer = new PathTracer4D({ maxDepth: 1, rng: () => 0 });
    const hit = { position: vec4(0, 0, 0, 0), normal: vec4(0, 1, 0, 0), materialId: "mat" };
    // Arbitrary BSDF directions must not get a nonzero continuous light PDF.
    assert.equal(tracer._sampleLightPDF(scene, hit, vec4(1, 0, 0, 0)), 0);
    assert.equal(tracer._sampleLightPDF(scene, hit, vec4(0, 1, 0, 0)), 0);
    assert.equal(tracer._sampleLightPDF(scene, hit, vec4(0, 0, 1, 0)), 0);
    // NEE still samples with discrete selection pdf 1/n (not used as continuous MIS dir pdf).
    const nee = tracer._sampleLight(scene, hit);
    assert.ok(nee);
    assert.ok(Math.abs(nee.pdf - 0.5) < 1e-9);
  });
});
