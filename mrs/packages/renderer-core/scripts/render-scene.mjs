#!/usr/bin/env node
/**
 * render-scene.mjs — SceneSpecification → deterministic RT4D still.
 *
 * Accepts --spec <path.json> (or inline via tests calling renderSceneFromSpec).
 * Optional --frame N / --time T for AnimationTimeline sampling.
 *
 * HONEST SCOPE (Drive-G-1):
 *   LLM/tool supplies WHAT (SceneSpecification). This CLI executes HOW via the
 *   same PathTracer4D / BVH4D / BSDF path as render-still.mjs. Not diffusion.
 *   Same specHash + seed + frame → byte-identical PNG.
 *
 * Usage:
 *   node scripts/render-scene.mjs --spec ./examples/tesseract.json \
 *        --output /tmp/out.png --provenance /tmp/out.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { Scene4D } from "../src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../src/render/rt4d/camera/Camera4D.js";
import { PathTracer4D } from "../src/render/rt4d/integrator/PathTracer4D.js";
import { Hypersphere, Hyperplane } from "../src/render/rt4d/geometry/hypersurface.js";
import { vec4 } from "../src/render/rt4d/math/vec4.js";

import {
  parseSceneSpecification,
  validateSceneCapabilities,
  convertSceneSpecification,
  sampleFrame,
} from "../src/scene-spec/index.js";

import { encodePNG } from "./render-still.mjs";

export const RENDER_SCENE_VERSION = "1.0.0";

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

function toByte(c, exposure) {
  let v = c * exposure;
  v = v / (1 + v);
  v = Math.pow(Math.max(0, v), 1 / 2.2);
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

function backgroundColor(dir, albedo) {
  const t = Math.min(1, Math.max(0, 0.5 * (dir.y + 1)));
  const [ar, ag, ab] = albedo;
  const horizon = [0.62, 0.66, 0.72];
  const zenith = [0.10 + ar * 0.10, 0.13 + ag * 0.10, 0.24 + ab * 0.10];
  return vec4(
    horizon[0] + (zenith[0] - horizon[0]) * t,
    horizon[1] + (zenith[1] - horizon[1]) * t,
    horizon[2] + (zenith[2] - horizon[2]) * t,
    0,
  );
}

function defaultCameraFromSeed(seed, width, height) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const theta = rng() * Math.PI * 2;
  const radius = 4.3;
  const elevation = 1.15 + rng() * 0.5;
  const camW = (rng() - 0.5) * 1.2;
  return {
    position4d: [
      Math.cos(theta) * radius,
      elevation,
      Math.sin(theta) * radius,
      camW,
    ],
    target4d: [0, 0.1, 0, 0],
    fovX: 52,
    fovY: 52,
    fovZ: 45,
    fovW: 28,
    width,
    height,
  };
}

/**
 * @param {object} spec — SceneSpecification (may include animation)
 * @param {{ frame?: number, time?: number }} [frameSel]
 */
export function renderSceneFromSpec(spec, frameSel = {}) {
  const structural = parseSceneSpecification(spec);
  if (!structural.ok) {
    const err = new Error(
      "invalid SceneSpecification: " +
        structural.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "),
    );
    err.errors = structural.errors;
    err.code = "SPEC_INVALID";
    throw err;
  }

  const sampled = sampleFrame(structural.value, frameSel);
  const caps = validateSceneCapabilities(sampled.spec, { target: "rt4d" });
  if (!caps.ok) {
    const err = new Error(
      "SceneSpecification capability check failed: " +
        caps.errors.map((e) => `${e.path}: ${e.message}`).join("; "),
    );
    err.errors = caps.errors;
    err.code = "SPEC_UNSUPPORTED";
    throw err;
  }

  const { rt4d, specHash, seed, worldDocument } = convertSceneSpecification(
    sampled.spec,
  );
  const { width, height, samples, maxDepth, exposure } = rt4d.output;

  const scene = new Scene4D();
  const matIds = new Set();

  for (const prim of rt4d.primitives) {
    const mid = prim.materialId || "surf";
    if (!matIds.has(mid)) {
      const [ar, ag, ab] = prim.albedo;
      scene.materials.createMaterial(mid, "lambertian", {
        albedo: vec4(ar, ag, ab, 1),
      });
      matIds.add(mid);
    }
    scene.addPrimitive(
      new Hypersphere(
        vec4(prim.center[0], prim.center[1], prim.center[2], prim.center[3]),
        prim.radius,
      ),
      mid,
    );
  }

  for (const pl of rt4d.planes) {
    const mid = pl.materialId || "ground";
    if (!matIds.has(mid)) {
      const [ar, ag, ab] = pl.albedo;
      scene.materials.createMaterial(mid, "lambertian", {
        albedo: vec4(ar, ag, ab, 1),
      });
      matIds.add(mid);
    }
    scene.addPrimitive(
      new Hyperplane(
        vec4(pl.normal[0], pl.normal[1], pl.normal[2], pl.normal[3]),
        pl.offset,
      ),
      mid,
    );
  }

  for (const L of rt4d.lights) {
    const mid = `light:${L.id}`;
    const em = L.emission;
    scene.materials.createMaterial(mid, "light", {
      emission: vec4(em[0], em[1], em[2], 0),
      albedo: vec4(1, 1, 1, 1),
    });
    scene.addLight(
      new Hypersphere(vec4(L.center[0], L.center[1], L.center[2], L.center[3]), L.radius),
      mid,
    );
  }

  scene.build();

  const camDesc =
    rt4d.camera ??
    defaultCameraFromSeed(seed, width, height);
  const camera = new Camera4D({
    x: camDesc.position4d[0],
    y: camDesc.position4d[1],
    z: camDesc.position4d[2],
    w: camDesc.position4d[3],
    lx: camDesc.target4d[0],
    ly: camDesc.target4d[1],
    lz: camDesc.target4d[2],
    lw: camDesc.target4d[3],
    fovX: camDesc.fovX ?? 52,
    fovY: camDesc.fovY ?? 52,
    fovZ: camDesc.fovZ ?? 45,
    fovW: camDesc.fovW ?? 28,
    width,
    height,
  });

  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples, rng });
  const albedo = rt4d.paletteAlbedo;
  const rgba = Buffer.alloc(width * height * 4);
  let lumSum = 0;
  let roiLumSum = 0;
  let roiCount = 0;
  const yLo = Math.floor(height * 0.15);
  const yHi = Math.floor(height * 0.7);
  const xLo = Math.floor(width * 0.25);
  const xHi = Math.floor(width * 0.75);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let s = 0; s < samples; s++) {
        const u1 = rng();
        const u2 = rng();
        // Central 4D slice — see render-still.mjs for why u3/u4 stay fixed.
        const ray = camera.generateRay(x, y, u1, u2, 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit
          ? tracer.trace(ray, scene)
          : backgroundColor(ray.direction, albedo);
        r += L.x;
        g += L.y;
        b += L.z;
      }
      const inv = 1 / samples;
      const R = toByte(r * inv, exposure);
      const G = toByte(g * inv, exposure);
      const B = toByte(b * inv, exposure);
      const idx = (y * width + x) * 4;
      rgba[idx] = R;
      rgba[idx + 1] = G;
      rgba[idx + 2] = B;
      rgba[idx + 3] = 255;
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      lumSum += lum;
      if (x >= xLo && x < xHi && y >= yLo && y < yHi) {
        roiLumSum += lum;
        roiCount += 1;
      }
    }
  }

  const png = encodePNG(width, height, rgba);
  const sha256 = createHash("sha256").update(png).digest("hex");

  const provenance = {
    engine: "mrs-renderer-core/rt4d",
    script: "render-scene",
    version: RENDER_SCENE_VERSION,
    kind: "deterministic-scene-spec-4d-render",
    specId: structural.value.id,
    specHash,
    seed,
    frameIndex: sampled.frameIndex,
    timeSeconds: sampled.time,
    width,
    height,
    samples,
    maxDepth,
    objectCount: rt4d.primitives.length,
    lightCount: rt4d.lights.length,
    mean_luminance: Number((lumSum / (width * height)).toFixed(3)),
    mean_luminance_center: Number(
      (roiCount > 0 ? roiLumSum / roiCount : 0).toFixed(3),
    ),
    sha256,
    worldId: worldDocument.id,
    determinism:
      "same specHash + seed + frameIndex → byte-identical PNG (mulberry32 path tracer)",
    note: "SceneSpecification-driven RT4D still. NOT text-to-image / not diffusion.",
  };

  return { png, provenance, worldDocument, rt4d };
}

const VALUE_OPTIONS = new Set([
  "spec",
  "frame",
  "time",
  "width",
  "height",
  "samples",
  "max-depth",
  "maxDepth",
  "seed",
  "output",
  "provenance",
]);

export function parseArgs(argv) {
  // Reuse still parser semantics with our value option set
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (!key) continue;
    const next = argv[i + 1];
    if (VALUE_OPTIONS.has(key)) {
      if (next === undefined) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
      continue;
    }
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.output;
  if (!output) {
    process.stderr.write("render-scene: --output <path.png> is required\n");
    process.exit(2);
  }
  if (typeof args.spec !== "string") {
    process.stderr.write("render-scene: --spec <path.json> is required\n");
    process.exit(2);
  }

  let raw;
  try {
    raw = readFileSync(args.spec, "utf8");
  } catch (err) {
    process.stderr.write(`render-scene: could not read spec: ${err}\n`);
    process.exit(2);
  }

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`render-scene: invalid JSON: ${err}\n`);
    process.exit(2);
  }

  // CLI overrides for output
  if (!spec.output) spec.output = {};
  if (args.width) spec.output.width = Number(args.width);
  if (args.height) spec.output.height = Number(args.height);
  if (args.samples) spec.output.samples = Number(args.samples);
  if (args["max-depth"] ?? args.maxDepth) {
    spec.output.maxDepth = Number(args["max-depth"] ?? args.maxDepth);
  }
  if (args.seed != null) spec.output.seed = Number(args.seed);

  const frameSel = {};
  if (args.frame != null) frameSel.frame = Number(args.frame);
  if (args.time != null) frameSel.time = Number(args.time);

  let result;
  try {
    result = renderSceneFromSpec(spec, frameSel);
  } catch (err) {
    if (err && err.errors) {
      process.stderr.write(
        JSON.stringify({ error: err.code || "SPEC_ERROR", errors: err.errors }) + "\n",
      );
    }
    process.stderr.write(
      `render-scene: render failed: ${err && err.stack ? err.stack : err}\n`,
    );
    process.exit(1);
  }

  const outPath = String(output).toLowerCase().endsWith(".png")
    ? String(output)
    : `${output}.png`;
  try {
    writeFileSync(outPath, result.png);
  } catch (err) {
    process.stderr.write(`render-scene: could not write ${outPath}: ${err}\n`);
    process.exit(1);
  }

  const provenance = { ...result.provenance, output: outPath };
  if (typeof args.provenance === "string") {
    try {
      writeFileSync(args.provenance, JSON.stringify(provenance, null, 2));
    } catch (err) {
      process.stderr.write(
        `render-scene: could not write provenance ${args.provenance}: ${err}\n`,
      );
    }
  }
  process.stdout.write(JSON.stringify(provenance) + "\n");
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) main();
