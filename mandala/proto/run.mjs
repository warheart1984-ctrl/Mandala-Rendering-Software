#!/usr/bin/env node
import { runTinyUniverse } from "./world.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createImage, projectCertified, imageToPpm } from "./mandala-project.mjs";
import { loadSliceInto } from "./certified-state.mjs";
import { defaultFlythroughPath, setObserverPath } from "./movie-lane.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(repoRoot, "output/mandala-proto");

const result = runTinyUniverse({ outDir, tEnd: 63, seed: 7, tryGpu: true });
console.log("certified t=", result.state.t, "hash=", result.state.hash.slice(0, 16));
console.log("gpu", result.gpu.status, result.gpu.device || result.gpu.reason?.step || "");
console.log("renderDidNotMutate", result.liveHashBefore === result.liveHashAfter);

const ffmpeg = join(repoRoot, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const framesDir = join(outDir, "frames");
mkdirSync(framesDir, { recursive: true });
const path = defaultFlythroughPath(result.state.temporal.filled, result.state.shape);
setObserverPath(result.state, path);
const image = createImage(64, 64);
const nFrames = 16;
for (let i = 0; i < nFrames; i++) {
  const t = Math.round((i / (nFrames - 1)) * (result.state.temporal.filled - 1));
  loadSliceInto(result.state, t);
  result.state.observer = { ...path[t], t };
  projectCertified(result.state, image);
  writeFileSync(join(framesDir, `f${String(i).padStart(3, "0")}.ppm`), imageToPpm(image));
}

const ff = spawnSync(
  ffmpeg,
  [
    "-y",
    "-framerate",
    "8",
    "-i",
    join(framesDir, "f%03d.ppm"),
    "-pix_fmt",
    "yuv420p",
    join(outDir, "observer-flythrough.mp4"),
  ],
  { encoding: "utf8" },
);
if (ff.status !== 0) {
  console.warn("ffmpeg flythrough skipped:", ff.stderr?.slice(0, 400) || ff.error?.message);
} else {
  console.log("wrote", join(outDir, "observer-flythrough.mp4"));
}
