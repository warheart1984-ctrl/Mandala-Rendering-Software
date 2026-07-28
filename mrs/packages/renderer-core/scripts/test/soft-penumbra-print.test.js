/**
 * Soft penumbra print path — radius floors + soft vs hard beauty difference.
 * STATUS: **enforced** for qualityOpts.softPenumbra on render-scene.
 */
import assert from "node:assert/strict";
import { renderSceneFromSpec } from "../render-scene.mjs";

function makeSpec({ softPenumbra, radius, id }) {
  return {
    schemaVersion: "1.0",
    kind: "SceneSpecification",
    id,
    materials: [{ id: "surf", color: "#aabbcc", opacity: 1 }],
    entities: [
      {
        id: "ball",
        materialId: "surf",
        geometry: { kind: "hypersphere", center: [0, 0.35, 0, 0], radius: 0.45 },
      },
    ],
    camera: {
      position4d: [2.6, 1.0, 2.0, 0],
      target4d: [0, 0.25, 0, 0],
      fovX: 48,
      fovY: 48,
      fovZ: 40,
      fovW: 28,
    },
    lights: [
      {
        id: "key",
        center: [2.2, 3.4, -1.2, 0],
        radius,
        emission: [14, 13, 12],
      },
    ],
    output: {
      width: 32,
      height: 32,
      samples: 3,
      maxDepth: 3,
      seed: 21,
      exposure: 1.3,
      qualityOpts: {
        adaptiveSampling: false,
        tonemap: "aces-lite",
        denoise: false,
        softPenumbra,
        penumbraLightSamples: softPenumbra ? 4 : 1,
      },
    },
  };
}

const softA = renderSceneFromSpec(makeSpec({ softPenumbra: true, radius: 0.05, id: "soft-a" }));
const softB = renderSceneFromSpec(makeSpec({ softPenumbra: true, radius: 0.05, id: "soft-b" }));
assert.equal(softA.provenance.softPenumbra, true);
assert.equal(softA.provenance.softPenumbraMinRadius, 0.75);
assert.equal(softA.provenance.sha256, softB.provenance.sha256);

const hard = renderSceneFromSpec(
  makeSpec({ softPenumbra: false, radius: 0.05, id: "hard" }),
);
assert.equal(hard.provenance.softPenumbra, false);
assert.notEqual(softA.provenance.sha256, hard.provenance.sha256);

console.log("soft-penumbra-print.test.js: PASS");
