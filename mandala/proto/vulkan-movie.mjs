#!/usr/bin/env node
/**
 * AAIS-gated movie whose pixels are drawn by the Vulkan slice kernel.
 *
 * Chamber commits t through the mass gate. Movie Lane only picks an observer.
 * Mandala freezes each slice and the Vulkan kernel writes RGB. ffmpeg packs H.264.
 *
 *   node mandala/proto/vulkan-movie.mjs
 *   node mandala/proto/vulkan-movie.mjs --frames 16 --width 128 --height 128 --seed 7
 *
 * Status: **partial**. Not a path tracer. CPU projectFrozen remains the formula check.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialCertifiedState, freezeCertifiedSnapshot, loadSliceInto } from "./certified-state.mjs";
import { createChamber, evolveTo } from "./simulation-chamber.mjs";
import { defaultFlythroughPath, setObserverPath } from "./movie-lane.mjs";
import { createImage, projectFrozen } from "./mandala-project.mjs";
import { AAIS_STATUS } from "./aais-gate.mjs";
import { projectSliceVulkan } from "./backend/vulkan-project.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");

export const VULKAN_MOVIE_STATUS = "partial";

function ffmpegBin() {
  if (process.env.MRS_FFMPEG && existsSync(process.env.MRS_FFMPEG)) return process.env.MRS_FFMPEG;
  const which = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

function maxAbsRgb(a, b) {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

function writePpm(path, width, height, rgb) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
  writeFileSync(path, Buffer.concat([header, Buffer.from(rgb)]));
}

export function runVulkanMovie({
  seed = 7,
  frames = 16,
  width = 128,
  height = 128,
  fps = 8,
  outDir = join(repoRoot, "output/mandala-vulkan-movie"),
} = {}) {
  const nFrames = Math.max(1, frames | 0);
  const universeT = Math.max(0, nFrames - 1);
  const state = createInitialCertifiedState({ seed });
  const hash0 = state.hash;
  const chamber = createChamber();
  const receipts = evolveTo(chamber, state, universeT);
  const rejected = receipts.filter((r) => !r.committed).length;
  if (rejected) {
    throw new Error(`AAIS rejected ${rejected} step(s); movie not rendered`);
  }
  const path = defaultFlythroughPath(state.temporal.filled, state.shape);
  setObserverPath(state, path);

  mkdirSync(outDir, { recursive: true });
  const framesDir = join(outDir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const scratch = join(outDir, "scratch");

  let device = null;
  let deviceType = null;
  let maxAbsError = 0;
  const hashBefore = state.hash;

  for (let i = 0; i < nFrames; i++) {
    const t = Math.min(state.temporal.filled - 1, Math.round((i / Math.max(1, nFrames - 1)) * (state.temporal.filled - 1)));
    loadSliceInto(state, t);
    const snap = freezeCertifiedSnapshot(state);
    const drawn = projectSliceVulkan(snap, { width, height, scratchDir: scratch });
    if (!drawn.ok) {
      const err = new Error(`Vulkan slice failed at frame ${i}`);
      err.evidence = drawn;
      throw err;
    }
    device = drawn.device;
    deviceType = drawn.deviceType;
    const cpu = createImage(width, height);
    projectFrozen(snap, cpu, { width, height });
    const err = maxAbsRgb(drawn.rgb, cpu.rgb);
    if (err > maxAbsError) maxAbsError = err;
    writePpm(join(framesDir, `f${String(i).padStart(3, "0")}.ppm`), width, height, drawn.rgb);
  }

  const hashAfter = state.hash;
  const ff = ffmpegBin();
  const mp4 = join(outDir, "movie.mp4");
  let encoded = false;
  let ffmpegError = null;
  if (!ff) {
    ffmpegError = "ffmpeg not on PATH and MRS_FFMPEG unset";
  } else {
    const enc = spawnSync(ff, [
      "-y",
      "-framerate", String(fps),
      "-i", join(framesDir, "f%03d.ppm"),
      "-pix_fmt", "yuv420p",
      mp4,
    ], { encoding: "utf8" });
    encoded = enc.status === 0 && existsSync(mp4);
    if (!encoded) ffmpegError = (enc.stderr || enc.error?.message || "ffmpeg failed").slice(0, 500);
  }

  const receipt = {
    status: VULKAN_MOVIE_STATUS,
    product: "aais-vulkan-slice-movie",
    aais: AAIS_STATUS,
    rule: "orthographic-z-slice",
    notAPathTracer: true,
    seed,
    frames: nFrames,
    width,
    height,
    fps,
    committedSteps: receipts.length,
    aaisRejected: rejected,
    constitutionId: state.constitutionId,
    hash0,
    hashBeforeRender: hashBefore,
    hashAfterRender: hashAfter,
    renderDidNotMutate: hashBefore === hashAfter,
    device,
    deviceType,
    maxAbsError,
    cpuAgreement: maxAbsError <= 1,
    mp4: encoded ? mp4 : null,
    encoded,
    ffmpegError,
  };
  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  return receipt;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed" && argv[i + 1]) out.seed = Number(argv[++i]);
    else if (a === "--frames" && argv[i + 1]) out.frames = Number(argv[++i]);
    else if (a === "--width" && argv[i + 1]) out.width = Number(argv[++i]);
    else if (a === "--height" && argv[i + 1]) out.height = Number(argv[++i]);
    else if (a === "--fps" && argv[i + 1]) out.fps = Number(argv[++i]);
    else if (a === "--out" && argv[i + 1]) out.outDir = argv[++i];
  }
  return out;
}

const isMain = process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("vulkan-movie.mjs");
if (isMain) {
  try {
    const receipt = runVulkanMovie(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({
      status: receipt.status,
      device: receipt.device,
      deviceType: receipt.deviceType,
      frames: receipt.frames,
      maxAbsError: receipt.maxAbsError,
      aaisRejected: receipt.aaisRejected,
      renderDidNotMutate: receipt.renderDidNotMutate,
      mp4: receipt.mp4,
      encoded: receipt.encoded,
    }, null, 2));
    if (!receipt.encoded || !receipt.cpuAgreement || !receipt.renderDidNotMutate) process.exit(1);
  } catch (err) {
    console.error(err.message);
    if (err.evidence) console.error(JSON.stringify(err.evidence, null, 2));
    process.exit(1);
  }
}
