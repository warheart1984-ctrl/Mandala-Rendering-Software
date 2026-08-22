#!/usr/bin/env node
/**
 * HoloRT4D human-facing frame — honest wave-optics path, not SD relabeled.
 *
 * Pipeline:
 *   RT4D path trace (humanoid capsules) → PathSample finalize
 *   → BinPaths → TiledAccumulate (CPU enforced) → PhaseEncode + DebugRealImag
 *
 * Usage:
 *   node scripts/holort4d-human-frame.mjs [--width 512] [--height 512] [--samples 8]
 *
 * Output: output/holort4d-human/holort4d/{frame,phase,lighting-reference}.png + provenance.json
 * Status: wave optics partial (CPU enforced, Polar GPU partial). Not photoreal.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHumanoidPrimitives } from "./humanoid-avatar.mjs";
import {
  FACE_ZONE_BOOST,
  DEFAULT_HUMAN_POSE,
  FULLBODY_BASE_Y,
  computeFaceZoneEllipse,
  pointInFaceZone,
  worldToPixel,
  createHumanCamera,
  projectPoseJoints,
} from "./holort4d-human-face.mjs";
import { Scene4D } from "../mrs/packages/renderer-core/src/render/rt4d/scene/Scene4D.js";
import { PathTracer4D } from "../mrs/packages/renderer-core/src/render/rt4d/integrator/PathTracer4D.js";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";
import { Hyperplane } from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import {
  HOLORT4D_STATUS,
  TILED_ACCUMULATE_STATUS,
  createHoloCamera,
  createComplexField,
  tiledAccumulate,
  binPathsU32,
  encodePhaseOnly,
  attachCiemsTrail,
  hashComplexField,
  hashTileHeaders,
  dumpDebugRealImagPng,
  encodePngRgba8,
  fieldMagnitude,
  describePolarDispatch,
} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "output/holort4d-human/holort4d");

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
  const opts = { width: 512, height: 512, samples: 8, seed: 42, scale: 1, fullbody: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--samples" && argv[i + 1]) opts.samples = parseInt(argv[++i], 10);
    else if (a === "--seed" && argv[i + 1]) opts.seed = parseInt(argv[++i], 10);
    else if (a === "--scale" && argv[i + 1]) opts.scale = parseInt(argv[++i], 10);
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--fullbody") opts.fullbody = true;
  }
  return opts;
}

function buildHumanScene(baseY = 0) {
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
    baseY,
    [0, 0, 0, 0],
  );
  for (const { primitive, materialId } of primitives) {
    scene.addPrimitive(primitive, materialId);
  }

  // Ground plane for contact shadow read (hyperplane y=0)
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), 0), "floor");

  scene.setLightRig([
    {
      type: "directional",
      direction: [0.35, -0.85, 0.4, 0],
      color: [1.0, 0.96, 0.9],
      intensity: 2.4,
    },
    {
      type: "directional",
      direction: [-0.5, -0.3, -0.2, 0],
      color: [0.55, 0.65, 0.85],
      intensity: 0.35,
    },
  ]);
  scene.setRt4dEnvironment({ color: [0.04, 0.05, 0.07], intensity: 0.25 });
  scene.build();
  return scene;
}

function backgroundColor(dir, palette = [0.04, 0.05, 0.07]) {
  const t = 0.5 * (dir.y + 1);
  return vec4(
    palette[0] * (1 - t) + 0.08 * t,
    palette[1] * (1 - t) + 0.09 * t,
    palette[2] * (1 - t) + 0.11 * t,
    1,
  );
}

function traceHumanPaths(scene, camera, tracer, opts) {
  const { width, height, samples, rng, faceZone } = opts;
  const paths = [];
  const lightingRgba = new Uint8ClampedArray(width * height * 4);
  let faceZoneBoostedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hitT = 0;
      let hitCount = 0;
      let weightBoost = 1;

      for (let s = 0; s < samples; s++) {
        const ray = camera.generateRay(x, y, rng(), rng(), 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit
          ? tracer.trace(ray, scene, 0, {
              sceneHash: "humanoid-holort4d",
              geometryHash: "humanoid-capsules-v2-head-cluster",
            })
          : backgroundColor(ray.direction);
        r += L.x;
        g += L.y;
        b += L.z;
        if (hit) {
          hitT += hit.t;
          hitCount += 1;
          if (faceZone && hit.position) {
            const hp = worldToPixel(camera, hit.position, width, height);
            if (hp && pointInFaceZone(hp.x, hp.y, faceZone)) {
              weightBoost = FACE_ZONE_BOOST;
            }
          }
        }
      }

      const inv = 1 / samples;
      const exposure = 2.2;
      const R = Math.min(255, Math.max(0, r * inv * exposure * 255));
      const G = Math.min(255, Math.max(0, g * inv * exposure * 255));
      const B = Math.min(255, Math.max(0, b * inv * exposure * 255));
      const idx = (y * width + x) * 4;
      lightingRgba[idx] = R;
      lightingRgba[idx + 1] = G;
      lightingRgba[idx + 2] = B;
      lightingRgba[idx + 3] = 255;

      const pixelId = y * width + x;
      const meanT = hitCount > 0 ? hitT / hitCount : 1.5;
      const lum = (R + G + B) / (3 * 255);
      const weight = Math.max(0.02, lum) * weightBoost;
      if (weightBoost > 1) faceZoneBoostedPixels += 1;
      paths.push({
        pixelId,
        opticalLength: meanT,
        radiance: { x: r * inv, y: g * inv, z: b * inv },
        weight,
        bounceId: 0,
        wl: 550e-9,
      });
    }
  }

  return { paths, lightingRgba, faceZoneBoostedPixels };
}

function phaseToRgba(phases, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i] ?? 0.5;
    const v = Math.round(p * 255);
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = Math.round((1 - p) * 180);
    rgba[o + 3] = 255;
  }
  return rgba;
}

function intensityFromField(field, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  let maxMag = 1e-9;
  for (const p of field) {
    maxMag = Math.max(maxMag, fieldMagnitude(p));
  }
  for (let i = 0; i < field.length; i++) {
    const m = fieldMagnitude(field[i]) / maxMag;
    const v = Math.round(Math.min(255, m * 255));
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return rgba;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = opts.out ? join(REPO, opts.out) : OUT_DIR;
  mkdirSync(outDir, { recursive: true });

  const { width, height, samples, seed, fullbody } = opts;
  const cameraMode = fullbody ? "fullbody" : "portrait";
  const baseY = fullbody ? FULLBODY_BASE_Y : 0;
  const scene = await buildHumanScene(baseY);
  const camera = createHumanCamera({ width, height, mode: cameraMode });
  const rng = mulberry32(seed >>> 0);
  const tracer = new PathTracer4D({ maxDepth: 4, samplesPerPixel: 1, rng });

  const faceZone = fullbody
    ? null
    : computeFaceZoneEllipse(camera, width, height, DEFAULT_HUMAN_POSE, baseY);
  const { paths, lightingRgba, faceZoneBoostedPixels } = traceHumanPaths(scene, camera, tracer, {
    width,
    height,
    samples,
    rng,
    faceZone,
  });
  const jointProjection = fullbody
    ? projectPoseJoints(camera, width, height, DEFAULT_HUMAN_POSE, baseY)
    : null;

  const holoResX = width;
  const holoResY = height;
  const cam = createHoloCamera({
    resX: holoResX,
    resY: holoResY,
    width,
    height,
    lambda: 550e-9,
  });
  const accumulateOpts = {
    frameWidth: width,
    frameHeight: height,
    holoResX,
    holoResY,
  };

  const bins = binPathsU32(paths, accumulateOpts);
  const field = createComplexField(holoResX, holoResY);
  const { writers, tiles } = tiledAccumulate(field, paths, cam, {
    ...accumulateOpts,
    bins,
  });

  const pass = attachCiemsTrail(
    {
      name: "holort4d-human-frame",
      paths,
      headers: bins.headers,
      field,
    },
    { paths, headers: bins.headers, field },
  );

  const phases = encodePhaseOnly(field, { mode: "tiled" });
  const polarPlan = describePolarDispatch({
    holoResX,
    holoResY,
    pathCount: paths.length,
  });

  const framePath = join(outDir, "frame.png");
  const phasePath = join(outDir, "phase.png");
  const intensityPath = join(outDir, "field-intensity.png");
  const lightingPath = join(outDir, "lighting-reference.png");

  const frameDump = dumpDebugRealImagPng(field, holoResX, holoResY, framePath, {
    layout: "rgb",
    scale: opts.scale,
    blue: "mag",
  });

  writeFileSync(phasePath, encodePngRgba8(holoResX, holoResY, phaseToRgba(phases, holoResX, holoResY)));
  writeFileSync(
    intensityPath,
    encodePngRgba8(holoResX, holoResY, intensityFromField(field, holoResX, holoResY)),
  );
  writeFileSync(lightingPath, encodePngRgba8(width, height, lightingRgba));

  const provenance = {
    intent: fullbody
      ? "one full-body human frame (head to feet) with real HoloRT4D CPU accumulation"
      : "one human-facing frame with real HoloRT4D CPU accumulation",
    honest: {
      holort4d: "wave-optics field from traced humanoid PathSamples — NOT SD, NOT photoreal",
      sdTurboSibling: join(REPO, "output/holort4d-human/human.png"),
      sdTurboNote: "parent human.png/mp4 are SD-Turbo reference only; this folder is governed HoloRT4D",
      chamberHolo: "not used (separate bulk-boundary contract)",
      photoreal: "declared — debug field viz + phase encode, not beauty mesh",
      geometry: fullbody
        ? "partial — capsule ragdoll head-to-feet; not GLB mesh"
        : "partial — capsule ragdoll head-shoulders crop",
    },
    camera: {
      mode: cameraMode,
      preset: cameraMode,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      lookAt: { x: camera.lookAt.x, y: camera.lookAt.y, z: camera.lookAt.z },
      fovX: camera.fovX,
      fovY: camera.fovY,
      jointProjection: jointProjection
        ? {
            joints: jointProjection,
            marginPx: (() => {
              if (!jointProjection.length) return null;
              const xs = jointProjection.map((j) => j.x);
              const ys = jointProjection.map((j) => j.y);
              return {
                left: Math.min(...xs),
                right: Math.max(...xs),
                top: Math.min(...ys),
                bottom: Math.max(...ys),
              };
            })(),
          }
        : null,
    },
    geometry: {
      source: "scripts/humanoid-avatar.mjs buildHumanoidPrimitives (OrientedCapsule + Hypersphere)",
      surfaceId: "humanoid-holort4d-capsules",
      pose: "standing, slight arm angle",
      baseY: fullbody ? FULLBODY_BASE_Y : 0,
    },
    lighting: {
      strategy: "RT4D path trace radiance → PathSample.radiance → complexContrib amplitude",
      key: "directional warm (intensity 2.4)",
      fill: "directional cool + low environment",
      ground: "Hyperplane y=0 for contact shadow",
      referencePng: "lighting-reference.png (RT4D only, not HoloRT4D output)",
      note: "Shadows/imperfections encoded in radiance weight before wave accumulate",
    },
    faceZone: fullbody
      ? {
          source: "disabled for full-body framing — uniform PathSample weights",
          status: "skipped",
        }
      : {
          source: "docs/holort4d/ART_DIRECTION_BRIEF.md §5 (eyes/brow/cheek priority)",
          ellipse: faceZone,
          weightBoost: FACE_ZONE_BOOST,
          boostedPathSamples: faceZoneBoostedPixels,
          status: "partial — screen-space ellipse on head-cluster hits, not FACS mesh",
        },
    pipeline: {
      stages: [
        { stage: "rt4d_path_trace", status: "enforced", module: "PathTracer4D + humanoid capsules" },
        {
          stage: "face_zone_weight_boost",
          status: fullbody ? "skipped" : "partial",
          boost: fullbody ? 1 : FACE_ZONE_BOOST,
          boostedSamples: faceZoneBoostedPixels,
        },
        { stage: "path_finalize", status: "enforced", fields: ["pixelId", "opticalLength", "radiance", "weight"] },
        { stage: "bin_paths", status: "enforced", cpu: true, gpu: "partial" },
        { stage: "tiled_accumulate", status: TILED_ACCUMULATE_STATUS.cpu, gpu: TILED_ACCUMULATE_STATUS.gpu },
        { stage: "phase_encode", status: HOLORT4D_STATUS.phaseEncodeCpu, gpu: HOLORT4D_STATUS.phaseEncode },
        { stage: "debug_real_imag", status: HOLORT4D_STATUS.debugRealImagCpu, gpu: HOLORT4D_STATUS.debugRealImagGpu },
      ],
      pathSampleCount: paths.length,
      tileCount: tiles.length,
      singleWriterPixels: writers.every((w) => w <= 1),
    },
    gpu: {
      polar: polarPlan,
      blocker: "Polar gfx803: zero f32 atomics on tiled path; physical bind groups 0/1; live dispatch partial",
    },
    ciems: {
      tileHeadersHash: pass.ciems?.evidence?.tileHeadersHash ?? hashTileHeaders(bins.headers),
      complexFieldHash: pass.ciems?.evidence?.complexFieldHash ?? hashComplexField(field),
      trail: "partial",
    },
    outputs: {
      frame: framePath,
      phase: phasePath,
      fieldIntensity: intensityPath,
      lightingReference: lightingPath,
    },
    render: { width, height, holoResX, holoResY, samples, seed },
    sha256: {
      frame: createHash("sha256").update(readFileSync(framePath)).digest("hex"),
      lightingReference: createHash("sha256").update(readFileSync(lightingPath)).digest("hex"),
    },
  };

  writeFileSync(join(outDir, "provenance.json"), JSON.stringify(provenance, null, 2));

  console.log(JSON.stringify({ ok: true, outDir, provenance: provenance.outputs }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
