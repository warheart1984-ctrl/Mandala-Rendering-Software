import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRt4dCameraTable, hashCameraMotion } from "../../src/world/CameraSystem.js";
import { createEnvironmentPreset, environmentToRt4dEntry, hashEnvironment } from "../../src/world/EnvironmentSystem.js";
import { buildRt4dLightTable, createLightingPreset, hashLightingRig } from "../../src/world/LightingSystem.js";
import { createWorldObject } from "../../src/world/WorldObject.js";

describe("LightingSystem", () => {
  it("maps directional, point, spot, area, and environment lights with soft-shadow params", () => {
    const lights = [
      createWorldObject({ id: "dir", kind: "light", geometry: null, material: null, light: { type: "directional", color: [1, 1, 1], intensity: 1, direction: [0, -1, 0], softness: 0.1 } }),
      createWorldObject({ id: "point", kind: "light", geometry: null, material: null, light: { type: "point", color: [1, 0, 0], intensity: 2, range: 10, radius: 0.25 } }),
      createWorldObject({ id: "spot", kind: "light", geometry: null, material: null, light: { type: "spot", color: [0, 1, 0], intensity: 3, coneAngle: 30, direction: [0, -1, 0] } }),
      createWorldObject({ id: "area", kind: "light", geometry: null, material: null, light: { type: "area", color: [0, 0, 1], intensity: 4, width: 2, height: 3, softness: 0.8 } }),
      createWorldObject({ id: "env", kind: "light", geometry: null, material: null, light: { type: "environment", color: [1, 1, 1], intensity: 0.5 } }),
    ];
    const table = buildRt4dLightTable(lights);
    assert.deepEqual(table.map((light) => light.id), ["area", "dir", "env", "point", "spot"]);
    assert.equal(table.find((light) => light.id === "area")!.softness, 0.8);
    assert.equal(typeof hashLightingRig(lights), "string");
  });

  it("creates portrait studio lighting presets", () => {
    const preset = createLightingPreset("portrait-studio");
    assert.deepEqual(preset.map((light) => light.id), ["key", "fill", "rim"]);
  });
});

describe("CameraSystem", () => {
  it("maps perspective, orthographic, portrait, wide, and macro camera contracts", () => {
    const cameras = [
      createWorldObject({ id: "persp", kind: "camera", geometry: null, material: null, camera: { type: "perspective" } }),
      createWorldObject({ id: "ortho", kind: "camera", geometry: null, material: null, camera: { type: "orthographic", orthographicHeight: 8 } }),
      createWorldObject({ id: "portrait", kind: "camera", geometry: null, material: null, camera: { type: "portrait", apertureF: 1.8, focusDistance: 2, exposure: 1.1 } }),
      createWorldObject({ id: "wide", kind: "camera", geometry: null, material: null, camera: { type: "wide" } }),
      createWorldObject({ id: "macro", kind: "camera", geometry: null, material: null, camera: { type: "macro", shutterSeconds: 1 / 48, motionBlur: true, motionPathId: "dolly-a" } }),
    ];
    const table = buildRt4dCameraTable(cameras);
    assert.equal(table.find((camera) => camera.id === "ortho")!.orthographicHeight, 8);
    assert.equal(table.find((camera) => camera.id === "portrait")!.focalLengthMm, 85);
    assert.equal(table.find((camera) => camera.id === "macro")!.motionBlur, true);
    assert.equal(typeof hashCameraMotion(cameras), "string");
  });
});

describe("EnvironmentSystem", () => {
  it("maps procedural environment presets and hashes them", () => {
    const env = createEnvironmentPreset("cosmic", 123);
    const rt4d = environmentToRt4dEntry(env);
    assert.equal(rt4d.preset, "cosmic");
    assert.equal(rt4d.proceduralSeed, 123);
    assert.equal(typeof hashEnvironment(env), "string");
  });
});
