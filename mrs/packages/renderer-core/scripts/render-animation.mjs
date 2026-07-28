#!/usr/bin/env node
/**
 * render-animation.mjs — deterministic RT4D animation renderer.
 *
 * Renders a sequence of PNG frames from a GLB model (or procedural scene) by
 * orbiting the camera around the scene. Each frame is independently path-traced
 * with the same seed + deterministic orbit offset for reproducibility.
 *
 * Usage:
 *   node scripts/render-animation.mjs --glb model.glb \
 *        --frames 72 --width 448 --height 448 --samples 16 --seed 42 \
 *        --output-dir /tmp/anim --orbit-start 0 --orbit-end 360
 *
 * Outputs:
 *   <output-dir>/frame_0000.png … frame_NNNN.png
 *   <output-dir>/manifest.json  (provenance + per-frame metadata)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

import { renderStill, encodePNG, parseArgs } from "./render-still.mjs";

const ANIMATION_VERSION = "1.0.0";

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function padFrame(n, total) {
  const digits = String(total).length;
  return String(n).padStart(digits, "0");
}

function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  const glbPath = args["glb"] ?? null;
  const frames = clampInt(args["frames"] ?? 24, 1, 1024);
  const width = clampInt(args["width"] ?? 448, 16, 1024);
  const height = clampInt(args["height"] ?? 448, 16, 1024);
  const samples = clampInt(args["samples"] ?? 16, 1, 512);
  const seed = args["seed"] != null ? (Number(args["seed"]) >>> 0) : 42;
  const outputDir = args["output-dir"] ?? "./anim-output";
  const orbitStart = args["orbit-start"] != null ? Number(args["orbit-start"]) : 0;
  const orbitEnd = args["orbit-end"] != null ? Number(args["orbit-end"]) : 360;
  const prompt = args["prompt"] ?? "";
  const maxDepth = clampInt(args["max-depth"] ?? 5, 1, 12);
  const denoise = args["no-denoise"] ? false : undefined;

  if (!glbPath && !prompt) {
    console.error("Usage: render-animation.mjs --glb <path> | --prompt <text> [--frames N]");
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  const orbitStep = (orbitEnd - orbitStart) / frames;
  const frameMeta = [];
  let allSha256 = [];

  for (let i = 0; i < frames; i++) {
    const orbitAngle = orbitStart + orbitStep * i;
    const frameSeed = seed + i * 1000;

    const result = renderStill({
      glbPath,
      prompt,
      width,
      height,
      samples,
      maxDepth,
      seed: frameSeed,
      denoise,
      camera: {
        orbit: orbitAngle,
      },
    });

    const frameName = `frame_${padFrame(i, frames)}.png`;
    const framePath = join(outputDir, frameName);
    writeFileSync(framePath, result.png);

    allSha256.push(result.provenance.sha256);
    frameMeta.push({
      frame: i,
      file: frameName,
      orbit: Number(orbitAngle.toFixed(4)),
      seed: frameSeed,
      sha256: result.provenance.sha256,
      bytes: result.png.length,
      mean_luminance: result.provenance.mean_luminance,
    });

    process.stderr.write(`  [${i + 1}/${frames}] ${frameName}  orbit=${orbitAngle.toFixed(1)}°  sha256=${result.provenance.sha256.slice(0, 12)}…\n`);
  }

  const manifestHash = createHash("sha256").update(allSha256.join(",")).digest("hex");
  const manifest = {
    engine: "mrs-renderer-core/rt4d",
    renderer_version: ANIMATION_VERSION,
    kind: "glb-animation-orbit",
    glb_path: glbPath,
    prompt,
    seed,
    frames,
    width,
    height,
    samples,
    max_depth: maxDepth,
    denoised: denoise !== false,
    orbit_start: orbitStart,
    orbit_end: orbitEnd,
    orbit_step: Number(orbitStep.toFixed(4)),
    manifest_hash: manifestHash,
    frames_meta: frameMeta,
  };

  const manifestPath = join(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const summary = {
    engine: manifest.engine,
    kind: manifest.kind,
    frames: manifest.frames,
    manifest_hash: manifest.manifest_hash,
    output_dir: outputDir,
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
}

main();
