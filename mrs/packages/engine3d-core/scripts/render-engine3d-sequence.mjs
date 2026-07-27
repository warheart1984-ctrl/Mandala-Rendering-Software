#!/usr/bin/env node
/**
 * render-engine3d-sequence.mjs — short Engine3D cinematic structure sequence.
 *
 * Status: **prepared**. Soft-raster CPU path; orbit camera timeline by default.
 * Does NOT claim 8K film farm / polish / RT4D (those are Genblaze stages).
 *
 * Usage:
 *   ENGINE3D_SEQUENCE=1 node scripts/render-engine3d-sequence.mjs \
 *     --out-dir /tmp/e3d-seq --width 64 --height 48 --duration 0.5 --fps 4
 *
 * Gate: --engine3d-sequence or ENGINE3D_SEQUENCE=1
 * On success: one JSON sequence record line on stdout.
 */

import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function loadApi() {
  const distIndex = join(PKG_ROOT, "dist", "src", "index.js");
  if (!existsSync(distIndex)) {
    throw new Error(
      `Built module missing: ${distIndex}. Run: npm run build (in engine3d-core)`,
    );
  }
  return import(pathToFileURL(distIndex).href);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gated =
    args["engine3d-sequence"] === true ||
    process.env.ENGINE3D_SEQUENCE === "1" ||
    process.env.ENGINE3D_SEQUENCE === "true";
  if (!gated) {
    process.stderr.write(
      "render-engine3d-sequence: refused — pass --engine3d-sequence or set ENGINE3D_SEQUENCE=1\n",
    );
    process.exit(2);
  }

  const outDir =
    typeof args["out-dir"] === "string"
      ? args["out-dir"]
      : join(PKG_ROOT, "output", "engine3d-sequence");
  mkdirSync(outDir, { recursive: true });

  const width = Math.max(16, Math.min(512, parseInt(String(args.width || "64"), 10) || 64));
  const height = Math.max(16, Math.min(512, parseInt(String(args.height || "48"), 10) || 48));
  const duration = Math.max(0.1, Math.min(5, parseFloat(String(args.duration || "0.5")) || 0.5));
  const fps = Math.max(1, Math.min(24, parseFloat(String(args.fps || "4")) || 4));
  const frameStart =
    typeof args["frame-start"] === "string" ? parseInt(args["frame-start"], 10) : undefined;
  const frameEnd =
    typeof args["frame-end"] === "string" ? parseInt(args["frame-end"], 10) : undefined;

  const allowHeavy =
    process.env.ENGINE3D_SEQUENCE_ALLOW_HEAVY === "1" ||
    args["allow-heavy"] === true;
  if (!allowHeavy && (width > 512 || height > 512)) {
    throw new Error(
      "resolution > 512 refused without --allow-heavy or ENGINE3D_SEQUENCE_ALLOW_HEAVY=1",
    );
  }

  const { defaultOrbitTimeline, Engine3DCinematicRuntime, frameCount } = await loadApi();
  const timeline = defaultOrbitTimeline({ duration, fps });
  const total = frameCount(timeline);

  const record = new Engine3DCinematicRuntime({
    timeline,
    outputDir: outDir,
    width,
    height,
    frameStart: Number.isFinite(frameStart) ? frameStart : 0,
    frameEnd: Number.isFinite(frameEnd) ? frameEnd : total - 1,
    resolutionLabel: "preview",
  }).runSequence();

  process.stdout.write(
    JSON.stringify({
      kind: "engine3d-cinematic-sequence",
      status: "ok",
      ...record,
    }) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(`render-engine3d-sequence: ${err?.stack || err}\n`);
  process.exit(1);
});
