/**
 * Print-path qualityOpts denoise — provenance + dual-run determinism.
 * STATUS: **enforced** for scene-spec → render-scene BilateralDenoiser.
 */
import assert from "node:assert/strict";
import { renderSceneFromSpec } from "../render-scene.mjs";

const baseSpec = {
  schemaVersion: "1.0",
  kind: "SceneSpecification",
  id: "print-quality-denoise-smoke",
  materials: [{ id: "surf", color: "#88aacc", opacity: 1 }],
  entities: [
    {
      id: "ball",
      materialId: "surf",
      geometry: { kind: "hypersphere", center: [0, 0.4, 0, 0], radius: 0.5 },
    },
  ],
  camera: {
    position4d: [2.5, 1.1, 2.2, 0],
    target4d: [0, 0.3, 0, 0],
    fovX: 50,
    fovY: 50,
    fovZ: 40,
    fovW: 28,
  },
  lights: [
    {
      id: "key",
      center: [2, 3, -1, 0],
      radius: 0.9,
      emission: [10, 9.5, 9],
    },
  ],
  output: {
    width: 32,
    height: 32,
    samples: 2,
    maxDepth: 3,
    seed: 11,
    exposure: 1.2,
    qualityOpts: {
      adaptiveSampling: false,
      tonemap: "aces-lite",
      denoise: true,
    },
  },
};

const a = renderSceneFromSpec(structuredClone(baseSpec));
const b = renderSceneFromSpec(structuredClone(baseSpec));
assert.equal(a.provenance.denoise, true);
assert.ok(a.provenance.denoiseFilterHash);
assert.equal(a.provenance.sha256, b.provenance.sha256);

const off = structuredClone(baseSpec);
off.output.qualityOpts.denoise = false;
off.id = "print-quality-denoise-off";
const c = renderSceneFromSpec(off);
assert.equal(c.provenance.denoise, false);
assert.equal(c.provenance.denoiseFilterHash, null);
assert.notEqual(a.provenance.sha256, c.provenance.sha256);

console.log("render-scene-print-quality.test.js: PASS");
