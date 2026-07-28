/**
 * Print-path GGX specular — SceneSpec brdf survives convert + render materials.
 * STATUS: **enforced** for scene-spec → render-scene print path.
 */
import assert from "node:assert/strict";
import {
  parseSceneSpecification,
  convertSceneSpecification,
} from "../../src/scene-spec/index.js";
import { renderSceneFromSpec } from "../render-scene.mjs";

const spec = {
  schemaVersion: "1.0",
  kind: "SceneSpecification",
  id: "print-specular-ggx",
  materials: [
    {
      id: "chrome",
      color: "#c8d0d8",
      opacity: 1,
      brdf: "ggx",
      roughness: 0.12,
      f0: 0.92,
    },
  ],
  entities: [
    {
      id: "ball",
      materialId: "chrome",
      geometry: { kind: "hypersphere", center: [0, 0.4, 0, 0], radius: 0.5 },
    },
  ],
  camera: {
    position4d: [2.4, 1.0, 2.1, 0],
    target4d: [0, 0.3, 0, 0],
    fovX: 48,
    fovY: 48,
    fovZ: 40,
    fovW: 28,
  },
  lights: [
    {
      id: "key",
      center: [2, 3.2, -1, 0],
      radius: 0.8,
      emission: [11, 10.5, 9.5],
    },
  ],
  output: {
    width: 24,
    height: 24,
    samples: 2,
    maxDepth: 3,
    seed: 5,
    exposure: 1.2,
    qualityOpts: { denoise: false, softPenumbra: true, tonemap: "aces-lite" },
  },
};

const parsed = parseSceneSpecification(spec);
assert.equal(parsed.ok, true);

const { rt4d } = convertSceneSpecification(parsed.value);
assert.equal(rt4d.primitives[0].materialType, "ggx");
assert.equal(rt4d.primitives[0].roughness, 0.12);
assert.equal(rt4d.primitives[0].f0, 0.92);

const bad = parseSceneSpecification({
  ...spec,
  id: "bad-brdf",
  materials: [{ id: "x", color: "#ffffff", brdf: "magic" }],
});
assert.equal(bad.ok, false);

const a = renderSceneFromSpec(structuredClone(spec));
const b = renderSceneFromSpec(structuredClone(spec));
assert.equal(a.provenance.sha256, b.provenance.sha256);
assert.ok(a.png.length > 32);

console.log("print-specular-ggx.test.js: PASS");
