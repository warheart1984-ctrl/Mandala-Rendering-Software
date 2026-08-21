#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseSceneSpecification } from "../mrs/packages/renderer-core/src/scene-spec/parse.js";
import { renderStill } from "../mrs/packages/renderer-core/scripts/render-still.mjs";

const OUTPUT_DIR = resolve(import.meta.dirname, "../output/pipeline");

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildSeedVariation(baseSeed, frameIndex, totalFrames) {
  const t = frameIndex / Math.max(totalFrames - 1, 1);
  const angle = t * Math.PI * 2;
  const radius = 5;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = 2 + Math.sin(angle * 2) * 0.5;
  const offset = Math.floor(x * 100 + y * 1000 + z * 10000);
  return (baseSeed + offset) >>> 0;
}

function renderFlipbook(sceneCardPath, outputDir, options = {}) {
  const raw = readFileSync(sceneCardPath, "utf8");
  const json = JSON.parse(raw);

  const validation = parseSceneSpecification(json);
  if (!validation.ok) {
    console.error(`Validation failed for ${basename(sceneCardPath)}:`);
    for (const err of validation.errors) {
      console.error(`  ${err.path}: ${err.message}`);
    }
    return null;
  }

  const output = json.output || {};
  const meta = json.metadata || {};
  const width = options.width || output.width || 128;
  const height = options.height || output.height || 128;
  const fps = options.fps || 12;
  const duration = options.duration || meta.duration || 3;
  const totalFrames = Math.ceil(duration * fps);
  const samples = options.samples || output.samples || 4;
  const maxDepth = options.maxDepth || output.maxDepth || 3;

  console.log(`  Flipbook ${json.id}: ${totalFrames} frames @ ${fps}fps, ${width}x${height}, ${samples} spp`);

  mkdirSync(outputDir, { recursive: true });

  const baseSeed = json.id ? hashString(json.id) : 42;
  const prompt = json.description || json.name || "abstract 4D geometry";
  const frames = [];

  for (let i = 0; i < totalFrames; i++) {
    const seed = buildSeedVariation(baseSeed, i, totalFrames);
    const { png } = renderStill({
      prompt,
      seed,
      width,
      height,
      samples,
      maxDepth,
      scene: json.archetype || null,
      palette: json.palette || null,
    });

    const framePath = resolve(outputDir, `frame-${String(i).padStart(4, "0")}.png`);
    writeFileSync(framePath, png);
    frames.push(framePath);

    if ((i + 1) % 5 === 0 || i === totalFrames - 1) {
      console.log(`    Frame ${i + 1}/${totalFrames}`);
    }
  }

  return { frames, outputDir, totalFrames, fps, duration };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node render-flipbook.mjs <scene-card.json> [output-dir] [--width N] [--height N] [--samples N] [--maxDepth N] [--fps N]");
  process.exit(1);
}

const positionalArgs = [];
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--width" && args[i + 1]) { options.width = parseInt(args[++i]); }
  else if (args[i] === "--height" && args[i + 1]) { options.height = parseInt(args[++i]); }
  else if (args[i] === "--samples" && args[i + 1]) { options.samples = parseInt(args[++i]); }
  else if (args[i] === "--maxDepth" && args[i + 1]) { options.maxDepth = parseInt(args[++i]); }
  else if (args[i] === "--fps" && args[i + 1]) { options.fps = parseInt(args[++i]); }
  else { positionalArgs.push(args[i]); }
}

const sceneCardPath = resolve(positionalArgs[0]);
const outputDir = positionalArgs[1] ? resolve(positionalArgs[1]) : resolve(OUTPUT_DIR, basename(sceneCardPath, ".json") + "-flipbook");

const result = renderFlipbook(sceneCardPath, outputDir, options);
if (result) {
  console.log(`  Output: ${result.outputDir}`);
  console.log(`  Frames: ${result.totalFrames}`);
}
