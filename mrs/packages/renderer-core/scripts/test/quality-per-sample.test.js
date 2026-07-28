/**
 * Quality-per-sample ladder — spp 8/24/48/64 vs reference (64).
 * STATUS: **enforced** for tiny scene-spec fixture (CPU PathTracer4D).
 */
import assert from "node:assert/strict";
import { renderSceneFromSpec } from "../render-scene.mjs";
import {
  mseRgba,
  qualityPerSampleLadder,
} from "../../src/render/rt4d/compare/qualityPerSample.js";

const SPP_LADDER = [8, 24, 48, 64];

function baseSpec(samples) {
  return {
    schemaVersion: "1.0",
    kind: "SceneSpecification",
    id: `qps-ladder-spp-${samples}`,
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
      width: 16,
      height: 16,
      samples,
      maxDepth: 4,
      seed: 42,
      exposure: 1.2,
      qualityOpts: {
        adaptiveSampling: false,
        tonemap: "aces-lite",
        denoise: false,
      },
    },
  };
}

const plates = [];
for (const spp of SPP_LADDER) {
  const result = renderSceneFromSpec(baseSpec(spp));
  assert.ok(result.rgba, "renderSceneFromSpec must expose beauty rgba for QPS");
  assert.equal(result.provenance.samples, spp);
  assert.equal(result.provenance.seed, 42);
  plates.push({
    spp,
    rgba: result.rgba,
    width: result.provenance.width,
    height: result.provenance.height,
    mean_luminance: result.provenance.mean_luminance,
  });
}

const ladder = qualityPerSampleLadder(plates);
assert.equal(ladder.length, 4);
assert.equal(ladder[0].spp, 8);
assert.equal(ladder[3].spp, 64);
assert.equal(ladder[3].mseToReference, 0);

// Higher spp must not get worse vs reference than lower spp (MC convergence).
for (let i = 1; i < ladder.length; i++) {
  assert.ok(
    ladder[i].mseToReference <= ladder[i - 1].mseToReference + 1e-12,
    `MSE must non-increase with spp: spp ${ladder[i - 1].spp}→${ladder[i].spp} ` +
      `${ladder[i - 1].mseToReference} → ${ladder[i].mseToReference}`,
  );
}

// Sanity: low spp differs from reference.
assert.ok(ladder[0].mseToReference > 0, "spp=8 should differ from spp=64 reference");

// Unit of mseRgba on identical buffers.
assert.equal(mseRgba(plates[3].rgba, plates[3].rgba, 16, 16), 0);

console.log(
  "quality-per-sample.test.js: PASS",
  JSON.stringify(
    ladder.map((r) => ({
      spp: r.spp,
      mseToReference: Number(r.mseToReference.toFixed(6)),
      qualityPerSample:
        r.qualityPerSample == null
          ? null
          : Number(r.qualityPerSample.toFixed(8)),
    })),
  ),
);
