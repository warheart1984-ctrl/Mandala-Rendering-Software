#!/usr/bin/env node
/**
 * finalize-movie-sequence.mjs — gap-safe PNG-sequence muxer.
 *
 * Reads a movie-sequence manifest ({format:"png-sequence", frameFiles,
 * fps, outputDir, basename, ...}) and muxes the frames into an h264 MP4
 * using ffmpeg's image concat demuxer. Uses the EXPLICIT frameFiles order
 * from the manifest — not a %04d/%05d glob — so sequences with missing
 * indices (e.g. a skipped retry) still mux correctly, and the order is the
 * one recorded in the evidence chain.
 *
 * Usage:
 *   node finalize-movie-sequence.mjs [path/to/movie-manifest.json]
 *
 * Writes: <outputDir>/<basename>.mp4
 * Updates: manifest.video {file,bytes,sha256} + muxHint, and appends a mux
 * entry to evidence-chain.json when present.
 *
 * Deterministic: output name derives from the manifest basename (no Date.now()).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const MANIFEST_PATH = process.argv[2] || "movie_sequence/movie-manifest.json";

function fail(msg) {
  console.error(`[finalize] ERROR: ${msg}`);
  process.exit(1);
}

function sha256File(file) {
  const data = readFileSync(file);
  return createHash("sha256").update(data).digest("hex");
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
    p.on("error", reject);
  });
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) fail(`manifest not found: ${MANIFEST_PATH}`);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  if (manifest.format !== "png-sequence") {
    fail(`unsupported format '${manifest.format}' (expected png-sequence)`);
  }

  const outDir = manifest.outputDir;
  const fps = manifest.fps ?? 1;
  const frameFiles = Array.isArray(manifest.frameFiles) ? manifest.frameFiles : [];
  if (frameFiles.length === 0) fail("manifest.frameFiles is empty");

  const framePaths = frameFiles.map((f) => join(outDir, f).replaceAll(sep, "/"));
  const missing = framePaths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    fail(`missing frame files (chain broken): ${missing.join(", ")}`);
  }

  // Build ffmpeg image-concat list. Each entry carries its duration;
  // the last frame is repeated once more so it keeps its full duration.
  const duration = (1 / fps).toFixed(6);
  let listText = "";
  for (const p of framePaths) {
    listText += `file '${p}'\nduration ${duration}\n`;
  }
  listText += `file '${framePaths[framePaths.length - 1]}'\n`;

  const listPath = join(outDir, "_concat.list").replaceAll(sep, "/");
  writeFileSync(listPath, listText, "utf8");

  const outFile = join(outDir, `${manifest.basename}.mp4`);
  const muxArgs = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "18",
    outFile,
  ];

  console.log(`[finalize] muxing ${framePaths.length} frames -> ${outFile}`);
  await run("ffmpeg", muxArgs);

  const bytes = readFileSync(outFile).length;
  const sha256 = sha256File(outFile);
  console.log(`[finalize] wrote ${outFile} (${bytes} bytes, sha256:${sha256.slice(0, 16)}...)`);

  // Update manifest with deterministic mux record + self-describing hint.
  manifest.video = { file: outFile, bytes, sha256 };
  manifest.muxHint = `ffmpeg ${muxArgs.join(" ")}`;
  // Additive per-frame radiance hashes (evidence chain uses placeholder
  // hashes; real values live here without retroactive chain edits).
  manifest.frameHashes = Object.fromEntries(
    frameFiles.map((f) => [f, `sha256:${sha256File(join(outDir, f))}`])
  );
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  // Append mux entry to the evidence chain (best-effort; chain may be absent).
  const chainPath = join(outDir, "evidence-chain.json");
  if (existsSync(chainPath)) {
    const chain = JSON.parse(readFileSync(chainPath, "utf8"));
    if (Array.isArray(chain)) {
      chain.push({
        stage: "mux",
        file: outFile.replaceAll(sep, "/"),
        bytes,
        sha256,
        frameFiles,
        fps,
        muxedAt: new Date().toISOString(),
      });
      writeFileSync(chainPath, JSON.stringify(chain, null, 2), "utf8");
    }
  }

  console.log("[finalize] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
