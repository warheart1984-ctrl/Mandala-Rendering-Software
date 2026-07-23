#!/usr/bin/env node
/**
 * Render Hyper-Caustic Lens v1.0 baseline and optionally write checksums.
 * Usage: node scripts/render-hyper-caustic-baseline.mjs [--write-hashes]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const validationDir = join(root, "docs", "4drs", "validation");
const artifactsDir = join(validationDir, "artifacts");
const baselinePath = join(validationDir, "baseline.json");
const writeHashes = process.argv.includes("--write-hashes");

const rt4dUrl = pathToFileURL(join(root, "mrs", "packages", "renderer-core", "src", "render", "rt4d", "index.js")).href;
const { createHyperCausticLens, renderRT4DFrame } = await import(rt4dUrl);

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const s = baseline.settings;

mkdirSync(artifactsDir, { recursive: true });

const { scene, camera } = createHyperCausticLens({
  width: s.width,
  height: s.height,
  lensRadius: s.lensRadius,
  camX: s.camX,
  camY: s.camY,
  camW: s.camW,
});

console.log(`[hcl] rendering ${s.width}x${s.height} spp=${s.samples} seed=${s.seed}…`);
const t0 = Date.now();
const { pixels, width, height } = await renderRT4DFrame(scene, camera, {
  width: s.width,
  height: s.height,
  samples: s.samples,
  maxDepth: s.maxDepth,
  seed: s.seed,
});
console.log(`[hcl] done in ${Date.now() - t0}ms`);

const ppmName = "hyper-caustic-lens-v1.0-preview.ppm";
const pngName = "hyper-caustic-lens-v1.0-preview.png";
const ppmPath = join(artifactsDir, ppmName);
const pngPath = join(artifactsDir, pngName);

writePpm(ppmPath, pixels, width, height);

let pngWritten = false;
try {
  const { createRequire } = await import("node:module");
  const requireFromPkg = createRequire(join(root, "mrs", "packages", "renderer-core", "package.json"));
  const { createCanvas } = requireFromPkg("canvas");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  writeFileSync(pngPath, canvas.toBuffer("image/png"));
  pngWritten = true;
} catch (err) {
  console.warn("[hcl] PNG skipped (canvas unavailable):", err.message);
}

const checksums = {
  previewPpm: sha256File(ppmPath),
  previewPng: pngWritten && existsSync(pngPath) ? sha256File(pngPath) : null,
};

baseline.artifacts.previewPpm = `artifacts/${ppmName}`;
baseline.artifacts.previewPng = `artifacts/${pngName}`;
baseline.checksums = checksums;
baseline.frozenAt = new Date().toISOString().slice(0, 10);

if (writeHashes) {
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log("[hcl] baseline.json checksums updated");
} else {
  console.log("[hcl] checksums (pass --write-hashes to persist):", checksums);
}

console.log("[hcl] wrote", ppmPath);
if (pngWritten) console.log("[hcl] wrote", pngPath);

function writePpm(path, rgba, w, h) {
  let body = `P3\n${w} ${h}\n255\n`;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    body += `${rgba[o]} ${rgba[o + 1]} ${rgba[o + 2]}\n`;
  }
  writeFileSync(path, body);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
