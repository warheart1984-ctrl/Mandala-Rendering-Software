#!/usr/bin/env node
/**
 * HoloRT4D depth lock — feed traced opticalLength + pixelId into PhaseEncode
 * and verify the hologram reconstructs tunnel/background depth behind the subject.
 *
 * Usage:
 *   node scripts/holort4d-depth-lock.mjs [--width 128] [--height 128] [--samples 4]
 *
 * Output: output/holort4d-debug/depth-lock/ + provenance.json
 * Status: CPU enforced (Polar GPU partial).
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHumanoidPrimitives } from "./humanoid-avatar.mjs";
import { Scene4D } from "../mrs/packages/renderer-core/src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../mrs/packages/renderer-core/src/render/rt4d/camera/Camera4D.js";
import { PathTracer4D } from "../mrs/packages/renderer-core/src/render/rt4d/integrator/PathTracer4D.js";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";
import { Hyperplane } from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import {
  DEPTH_RECONSTRUCT_STATUS,
  createHoloCamera,
  encodePngRgba8,
  scorePixelIdMapping,
  scatterOpticalLength,
  scatterOpticalLengthTileModWrong,
  depthToRgba,
  phaseToRgba,
  reconstructPhaseFromPaths,
  depthToComplexField,
  encodePhaseOnly,
} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "output/holort4d-debug/depth-lock");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const opts = { width: 128, height: 128, samples: 4, seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--samples" && argv[i + 1]) opts.samples = parseInt(argv[++i], 10);
    else if (a === "--seed" && argv[i + 1]) opts.seed = parseInt(argv[++i], 10);
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
  }
  return opts;
}

function buildHumanScene() {
  const scene = new Scene4D({ surfaceId: "humanoid-holort4d-capsules" });
  scene.materials.createMaterial("skin", "lambertian", {
    albedo: vec4(0.72, 0.58, 0.48, 1),
  });
  scene.materials.createMaterial("floor", "lambertian", {
    albedo: vec4(0.15, 0.15, 0.16, 1),
  });
  const { primitives } = buildHumanoidPrimitives(
    { armAngle: 0.25, armSwing: 0.1, legSpread: 0.12, bodyLean: 0.05 },
    "skin",
    0,
    [0, 0, 0, 0],
  );
  for (const { primitive, materialId } of primitives) {
    scene.addPrimitive(primitive, materialId);
  }
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), 0), "floor");
  scene.setLightRig([
    { type: "directional", direction: [0.35, -0.85, 0.4, 0], color: [1.0, 0.96, 0.9], intensity: 2.4 },
    { type: "directional", direction: [-0.5, -0.3, -0.2, 0], color: [0.55, 0.65, 0.85], intensity: 0.35 },
  ]);
  scene.setRt4dEnvironment({ color: [0.04, 0.05, 0.07], intensity: 0.25 });
  scene.build();
  return scene;
}

function backgroundColor(dir) {
  const t = 0.5 * (dir.y + 1);
  return vec4(0.04 * (1 - t) + 0.08 * t, 0.05 * (1 - t) + 0.09 * t, 0.07 * (1 - t) + 0.11 * t, 1);
}

function tracePaths(scene, camera, tracer, opts) {
  const { width, height, samples, rng } = opts;
  const paths = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hitT = 0;
      let hitCount = 0;
      for (let s = 0; s < samples; s++) {
        const ray = camera.generateRay(x, y, rng(), rng(), 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit
          ? tracer.trace(ray, scene, 0, { sceneHash: "depth-lock", geometryHash: "humanoid-capsules-v2" })
          : backgroundColor(ray.direction);
        r += L.x;
        g += L.y;
        b += L.z;
        if (hit) {
          hitT += hit.t;
          hitCount += 1;
        }
      }
      const inv = 1 / samples;
      const pixelId = y * width + x;
      const meanT = hitCount > 0 ? hitT / hitCount : 1.5;
      paths.push({
        pixelId,
        opticalLength: meanT,
        radiance: { x: r * inv, y: g * inv, z: b * inv },
        weight: 1,
        bounceId: 0,
        wl: 550e-9,
      });
    }
  }
  return paths;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = opts.out ? join(REPO, opts.out) : OUT_DIR;
  mkdirSync(outDir, { recursive: true });

  const scene = buildHumanScene();
  const { width, height, samples, seed } = opts;
  const camera = new Camera4D({
    x: 0,
    y: 1.05,
    z: -2.4,
    lx: 0,
    ly: 1.0,
    lz: 0,
    width,
    height,
    fovX: 42,
    fovY: 52,
  });
  const rng = mulberry32(seed >>> 0);
  const tracer = new PathTracer4D({ maxDepth: 4, samplesPerPixel: 1, rng });
  const paths = tracePaths(scene, camera, tracer, { width, height, samples, rng });

  const holoResX = width;
  const holoResY = height;
  const cam = createHoloCamera({ resX: holoResX, resY: holoResY, width, height, lambda: 550e-9 });
  const frameOpts = {
    frameWidth: width,
    frameHeight: height,
    holoResX,
    holoResY,
    subjectThreshold: 2.2,
    backgroundMin: 1.4,
  };

  const score = scorePixelIdMapping(paths, cam, frameOpts);
  const { depth: tracedDepth } = scatterOpticalLength(paths, frameOpts);
  const wrongDepth = scatterOpticalLengthTileModWrong(paths, holoResX, holoResY);

  const uniformPaths = paths.map((p) => ({ ...p, radiance: 1, weight: 1, wl: cam.lambda }));
  const { phases: pipelinePhases } = reconstructPhaseFromPaths(uniformPaths, cam, frameOpts);
  const depthOnlyPhases = encodePhaseOnly(depthToComplexField(tracedDepth, cam.lambda), { mode: "tiled" });

  const depthPath = join(outDir, "depth-traced.png");
  const phasePath = join(outDir, "phase-from-depth.png");
  const pipelinePhasePath = join(outDir, "phase-pipeline.png");
  const wrongPath = join(outDir, "depth-wrong-map.png");
  const tunnelPath = join(outDir, "tunnel-mask.png");

  writeFileSync(depthPath, encodePngRgba8(holoResX, holoResY, depthToRgba(tracedDepth, holoResX, holoResY)));
  writeFileSync(phasePath, encodePngRgba8(holoResX, holoResY, phaseToRgba(depthOnlyPhases, holoResX, holoResY)));
  writeFileSync(
    pipelinePhasePath,
    encodePngRgba8(holoResX, holoResY, phaseToRgba(pipelinePhases, holoResX, holoResY)),
  );
  writeFileSync(wrongPath, encodePngRgba8(holoResX, holoResY, depthToRgba(wrongDepth, holoResX, holoResY)));

  const tunnelRgba = new Uint8Array(holoResX * holoResY * 4);
  for (let y = 0; y < holoResY; y++) {
    for (let x = 0; x < holoResX; x++) {
      const idx = y * holoResX + x;
      const d = tracedDepth[idx];
      const o = idx * 4;
      const near = d > 0 && d < frameOpts.subjectThreshold;
      const far = d >= frameOpts.backgroundMin;
      tunnelRgba[o] = near ? 220 : far ? 40 : 100;
      tunnelRgba[o + 1] = near ? 80 : far ? 160 : 100;
      tunnelRgba[o + 2] = near ? 80 : far ? 220 : 100;
      tunnelRgba[o + 3] = 255;
    }
  }
  writeFileSync(tunnelPath, encodePngRgba8(holoResX, holoResY, tunnelRgba));

  const provenance = {
    intent: "pixelId + opticalLength depth lock — tunnel behind subject reconstruction",
    status: {
      depthReconstruct: DEPTH_RECONSTRUCT_STATUS,
      pixelIdMapping: score.pass ? "PASS" : "FAIL",
      cpu: "enforced",
      gpu: "declared",
    },
    verdict: {
      pass: score.pass,
      roundtrip: score.roundtrip,
      scatterRt: score.scatterRt,
      corrWrong: score.corrWrong,
      depthPhaseAgreement: score.depthPhaseAgreement,
      phaseAgreement: score.phaseAgreement,
      tunnel: score.tunnel,
    },
    siblingFrame: join(REPO, "output/holort4d-human/holort4d/"),
    note:
      "Tunnel = far opticalLength (sky/miss) visible around near subject silhouette. Wrong tile-mod map scrambles depth.",
    outputs: {
      depthTraced: depthPath,
      phaseFromDepth: phasePath,
      phasePipeline: pipelinePhasePath,
      depthWrongMap: wrongPath,
      tunnelMask: tunnelPath,
    },
    render: { width, height, samples, seed },
  };

  writeFileSync(join(outDir, "provenance.json"), JSON.stringify(provenance, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        pixelIdMapping: score.pass ? "PASS" : "FAIL",
        outDir,
        verdict: provenance.verdict,
        outputs: provenance.outputs,
      },
      null,
      2,
    ),
  );

  if (!score.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
