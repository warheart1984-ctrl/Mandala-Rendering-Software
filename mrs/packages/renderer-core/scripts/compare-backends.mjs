#!/usr/bin/env node
/**
 * compare-backends.mjs — CPU↔GPU backend comparison harness.
 *
 * Loads a canonical scene config JSON, runs the CPU integrator (and optionally
 * a GPU/reference backend), computes image metrics, and emits a replay receipt
 * binding both outputs to the same constitutional state.
 *
 * Usage:
 *   node compare-backends.mjs \
 *     --config mrs/demo/scene-configs/emissive-quad-floor.json \
 *     --output-dir /tmp/compare-output
 *
 * When --gpu-backend is omitted, the harness runs the CPU backend twice
 * (identity comparison) to validate the metrics pipeline itself.
 *
 * WebGPU honesty (Drive-G-1):
 *   Node CI typically has no navigator.gpu. Missing GPU → document skip
 *   (skip ≠ pass). Do not treat identity CPU-twice as live GPU parity.
 *   See src/render/rt4d/compare/printParity.js probeWebGpuAvailability().
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Scene4D } from "../src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../src/render/rt4d/camera/Camera4D.js";
import { PathTracer4D } from "../src/render/rt4d/integrator/PathTracer4D.js";
import { vec4 } from "../src/render/rt4d/math/vec4.js";
import { importTriangleMeshesFromGlb, importMeshesFromGlb } from "../src/asset-pipeline/GLBMeshImporter4D.js";
import { compareImages } from "../src/render/rt4d/compare/imageMetrics.js";
import {
  generateReplayReceipt,
  hashSceneConfig,
  hashIntent,
} from "../src/render/rt4d/compare/replayReceipt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

const RENDERER_VERSION = "1.1.0";

// ---------------------------------------------------------------------------
// Mulberry32 — deterministic PRNG (same as render-still.mjs)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// sRGB helpers (same as render-still.mjs)
// ---------------------------------------------------------------------------
function toByte(linear, exposure = 2.4) {
  const mapped = 1 - Math.exp(-linear * exposure);
  const gamma = Math.pow(Math.max(0, Math.min(1, mapped)), 1 / 2.2);
  return Math.max(0, Math.min(255, Math.round(gamma * 255)));
}

function encodePNG(width, height, rgba) {
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }

  const uint32 = (v) => [(v >>> 0) & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const uint16 = (v) => [v & 0xff, (v >>> 8) & 0xff];

  // IHDR
  const ihdrData = [...uint32(width), ...uint32(height), 8, 6, 0, 0, 0];
  const ihdrChunk = chunk("IHDR", ihdrData);

  // IDAT (raw deflate: store blocks, no compression)
  const deflateData = deflateStore(new Uint8Array(raw));
  const idatChunk = chunk("IDAT", deflateData);

  // IEND
  const iendChunk = chunk("IEND", []);

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const pngData = [...signature, ...ihdrChunk, ...idatChunk, ...iendChunk];
  return Buffer.from(pngData);
}

function chunk(type, data) {
  const typeBytes = [...type].map((c) => c.charCodeAt(0));
  const crcInput = [...typeBytes, ...data];
  const crc = crc32(new Uint8Array(crcInput));
  return [...uint32(data.length), ...typeBytes, ...data, ...uint32(crc)];
}

function uint32(v) {
  return [(v >>> 0) & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function deflateStore(data) {
  const blocks = [];
  const blocksize = 65535;
  for (let i = 0; i < data.length; i += blocksize) {
    const end = Math.min(i + blocksize, data.length);
    const isLast = end >= data.length;
    blocks.push(isLast ? 0x01 : 0x00);
    const len = end - i;
    blocks.push(len & 0xff, (len >>> 8) & 0xff);
    blocks.push(~len & 0xff, (~len >>> 8) & 0xff);
    for (let j = i; j < end; j++) blocks.push(data[j]);
  }
  const adler = adler32(data);
  return [...blocks, (adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff];
}

function adler32(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Build camera from scene config camera params
// ---------------------------------------------------------------------------
function buildCameraFromConfig(cfg, width, height) {
  const cam = cfg.camera ?? {};
  const orbitAngle = cam.orbitAngle ?? 0;
  const orbitRadius = cam.orbitRadius ?? 4.0;
  const elevation = cam.elevation ?? 1.0;
  const focalDistance = cam.focalDistance ?? 3.0;

  const x = orbitRadius * Math.cos(orbitAngle);
  const z = orbitRadius * Math.sin(orbitAngle);
  const y = elevation;

  return new Camera4D({
    x, y, z, w: 0,
    lx: 0, ly: 0.5, lz: 0, lw: 0,
    fovX: 52,
    fovY: 52,
    fovW: 8,
    width,
    height,
    focalDistance,
  });
}

// ---------------------------------------------------------------------------
// Build Scene4D from GLB file
// ---------------------------------------------------------------------------
function buildSceneFromGlb(glbPath) {
  const glbBytes = new Uint8Array(readFileSync(glbPath));
  const scene = new Scene4D();

  let meshes;
  try {
    meshes = importTriangleMeshesFromGlb(glbBytes);
  } catch {
    // Fallback: try raw mesh import
    meshes = importMeshesFromGlb(glbBytes);
  }

  for (const mesh of meshes) {
    const matId = mesh.materialId ?? "default";
    if (!scene.materials.get(matId)) {
      scene.materials.createMaterial(matId, "lambertian", {
        albedo: vec4(0.7, 0.7, 0.7, 1),
      });
    }
    scene.addTriangleMesh(mesh, matId);
  }

  scene.materials.createMaterial("floor", "lambertian", {
    albedo: vec4(0.4, 0.4, 0.4, 1),
  });

  scene.build();
  return scene;
}

// ---------------------------------------------------------------------------
// Render a scene with PathTracer4D (CPU backend)
// ---------------------------------------------------------------------------
function renderCpu(scene, camera, cfg) {
  const { width, height, spp, seed } = cfg;
  const maxDepth = cfg.maxDepth ?? 5;
  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: spp, rng });
  const exposure = 2.4;

  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let s = 0; s < spp; s++) {
        const u1 = rng();
        const u2 = rng();
        const ray = camera.generateRay(x, y, u1, u2, 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit ? tracer.trace(ray, scene) : vec4(0.05, 0.05, 0.08, 0);
        r += L.x;
        g += L.y;
        b += L.z;
      }
      const inv = 1 / spp;
      const idx = (y * width + x) * 4;
      rgba[idx] = toByte(r * inv, exposure);
      rgba[idx + 1] = toByte(g * inv, exposure);
      rgba[idx + 2] = toByte(b * inv, exposure);
      rgba[idx + 3] = 255;
    }
  }

  const png = encodePNG(width, height, rgba);
  const sha256 = createHash("sha256").update(png).digest("hex");

  return {
    png,
    rgba,
    provenance: {
      engine: "mrs-renderer-core/rt4d",
      renderer_version: RENDERER_VERSION,
      backend: "PathTracer4D_CPU",
      sceneId: cfg.sceneId,
      seed,
      spp,
      width,
      height,
      sha256,
    },
  };
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  const valueOptions = new Set(["config", "output-dir", "gpu-backend"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (!key) continue;
    if (valueOptions.has(key)) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.config) {
    process.stderr.write("Usage: compare-backends.mjs --config <scene-config.json> [--output-dir <dir>]\n");
    process.exit(1);
  }

  const configPath = resolve(args.config);
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const outputDir = resolve(args.outputDir ?? join(REPO_ROOT, "renders", "compare"));
  mkdirSync(outputDir, { recursive: true });

  // Resolve GLB path relative to repo root
  const glbPath = resolve(REPO_ROOT, cfg.glbPath);
  if (!existsSync(glbPath)) {
    process.stderr.write(`compare-backends: GLB not found: ${glbPath}\n`);
    process.stderr.write("Run: node scripts/generate-demo-glbs.mjs to create demo GLBs\n");
    process.exit(1);
  }

  process.stderr.write(`[compare] scene: ${cfg.sceneId}\n`);
  process.stderr.write(`[compare] glb: ${glbPath}\n`);
  process.stderr.write(`[compare] ${cfg.width}×${cfg.height} @ ${cfg.spp}spp seed=${cfg.seed}\n`);

  // Build scene + camera
  const scene = buildSceneFromGlb(glbPath);
  const camera = buildCameraFromConfig(cfg, cfg.width, cfg.height);

  // --- CPU backend ---
  process.stderr.write("[compare] running CPU backend...\n");
  const cpuResult = renderCpu(scene, camera, cfg);

  // --- GPU/second backend ---
  // For self-test: run CPU again with identical params → should produce
  // bit-identical output (same scene, same seed, same PRNG state).
  // When a WebGPU backend is available, swap this with renderGpu().
  // STATUS: **partial** — second run is CPU identity unless --gpu-backend
  // provides a real path; missing navigator.gpu must not be reported as PASS.
  const gpuBackend = args["gpu-backend"] || "cpu-identity";
  process.stderr.write(`[compare] second backend mode: ${gpuBackend}\n`);
  if (gpuBackend !== "cpu-identity") {
    process.stderr.write(
      "[compare] NOTE: live WebGPU path not wired in Node — falling back to CPU identity (partial)\n",
    );
  }
  process.stderr.write("[compare] running reference backend...\n");
  const gpuResult = renderCpu(scene, camera, cfg);
  gpuResult.provenance.backend =
    gpuBackend === "cpu-identity"
      ? "PathTracer4D_CPU_IDENTITY"
      : "PathTracer4D_GPU_UNAVAILABLE_FALLBACK";
  gpuResult.provenance.webgpuStatusTag = "partial";
  gpuResult.provenance.webgpuNote =
    "skip ≠ pass when navigator.gpu missing; see printParity.js";

  // --- Compare ---
  process.stderr.write("[compare] computing metrics...\n");
  const thresholds = cfg.thresholds ?? { maxPixelDelta: 0.01, mse: 0.0001, ssim: 0.99 };
  const comparison = compareImages(
    cpuResult.rgba,
    gpuResult.rgba,
    cfg.width,
    cfg.height,
    thresholds,
  );

  // --- Replay receipt ---
  const receipt = generateReplayReceipt({
    sceneConfig: cfg,
    cpu: {
      pngBuffer: cpuResult.png,
      provenance: cpuResult.provenance,
      rendererVersion: RENDERER_VERSION,
    },
    gpu: {
      pngBuffer: gpuResult.png,
      provenance: gpuResult.provenance,
      rendererVersion: RENDERER_VERSION,
    },
    comparison,
  });

  // --- Output ---
  const receiptPath = join(outputDir, `receipt-${cfg.sceneId}.json`);
  const cpuPngPath = join(outputDir, `cpu-${cfg.sceneId}.png`);
  const gpuPngPath = join(outputDir, `gpu-${cfg.sceneId}.png`);

  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  writeFileSync(cpuPngPath, cpuResult.png);
  writeFileSync(gpuPngPath, gpuResult.png);

  process.stderr.write(`[compare] status: ${comparison.status}\n`);
  process.stderr.write(`[compare] maxPixelDelta: ${comparison.maxPixelDelta.toFixed(6)}\n`);
  process.stderr.write(`[compare] MSE: ${comparison.mse.toFixed(8)}\n`);
  process.stderr.write(`[compare] SSIM: ${comparison.ssim.toFixed(6)}\n`);
  process.stderr.write(`[compare] receipt: ${receiptPath}\n`);

  // Emit receipt to stdout for machine consumption
  process.stdout.write(JSON.stringify(receipt) + "\n");

  if (comparison.status !== "pass") {
    process.stderr.write("[compare] FAIL — thresholds exceeded\n");
    process.exit(2);
  }
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) main();
