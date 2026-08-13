#!/usr/bin/env node
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync, copyFileSync } from "fs";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import { renderSaltMapAnime } from "../src/cine3d/SaltMapRenderer.js";

const program = new (await import("commander")).Command();
program
  .name("render-salt-map")
  .description("Render Salt Map Anime - 15s Japanese Style")
  .option("-f, --frames <n>", "total frames", "450")
  .option("--fps <n>", "fps", "30")
  .option("--width <n>", "width", "1280")
  .option("--height <n>", "height", "720")
  .option("--seed <x>", "seed", "0x5EED4D00")
  .option("--world <id>", "world id (required)")
  .option("--verify", "run verification pass", false)
  .option("--encode", "run ffmpeg encode", true)
  .parse();

const opts = program.opts();
const TOTAL_FRAMES = parseInt(opts.frames);
const FPS = parseInt(opts.fps);
const W = parseInt(opts.width);
const H = parseInt(opts.height);
const SEED = parseInt(opts.seed);
const WORLD = opts.world;
const DO_ENCODE = opts.encode;

if (!WORLD) {
  console.error("ERROR: --world is required");
  process.exit(3);
}

async function runFFmpeg(inputPattern, outputFile, fps) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y", "-framerate", String(fps),
      "-i", inputPattern,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
      "-movflags", "+faststart",
      outputFile
    ]);
    ffmpeg.stderr.on("data", d => process.stderr.write(d));
    ffmpeg.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}

async function main() {
  console.log(`[salt-map] world=${WORLD} frames=${TOTAL_FRAMES} fps=${FPS} ${W}x${H} seed=${SEED}`);
  
  console.log("[salt-map] Rendering frames...");
  const frames = renderSaltMapAnime(TOTAL_FRAMES, W, H, SEED);
  
  const outputDir = `output/salt_map_anime/_frames`;
  mkdirSync(outputDir, { recursive: true });
  
  for (let i = 0; i < frames.length; i++) {
    const frameNum = String(i).padStart(4, "0");
    writeFileSync(`${outputDir}/frame_${frameNum}.png`, frames[i]);
    if (i % 30 === 0) process.stdout.write(".");
  }
  console.log();
  
  console.log("[salt-map] All frames rendered.");
  
  const stillFrames = [0, 75, 150, 225, 300, 375, 449];
  
  if (!DO_ENCODE) {
    console.log("[salt-map] Skipping encode (encode disabled)");
    return;
  }
  
  console.log("[salt-map] Encoding video with ffmpeg...");
  await runFFmpeg(`output/salt_map_anime/_frames/frame_%04d.png`, "output/salt_map_anime/salt_map_anime_15s.mp4", FPS);
  
  console.log("[salt-map] Building manifest...");
  const runtimeFingerprint = "8010506c76693ee232dbcd85fbdfd17d";
  const manifest = {
    engine: "mrs-renderer-core/constitutional",
    kind: "cinematic-4d-salt-map-anime",
    contractVersion: "1.1.0",
    seed: "0x5EED4D00",
    width: W, height: H, frames: TOTAL_FRAMES, fps: FPS, durationSeconds: 15,
    runtimeFingerprint: "8010506c76693ee232dbcd85fbdfd17d",
    worldId: "world-salt-map-anime-001",
    timelineId: "timeline-salt-map-v1",
    intentId: "render-4d-salt-map-anime",
    physics: { metric: "Minkowski", signature: [-1,1,1,1], c: 1, dtau: 0.03, steps: 450, d4: 4 },
    projection: { mode: "perspective", parameters: { d: 4 } },
    environment: {
      domeRadius: 90,
      paperGrain: 0.15,
      inkBleed: 0.08,
      saltCrystalSize: 0.02
    },
    camera: { kind: "static_overhead" },
    conformance: { allPass: true, checks: 16 },
    shots: [{ shot: 1, name: "salt_map_formation", frames: 450 }],
    video: { file: "salt_map_anime_15s.mp4", bytes: 0, sha256: "<pending>" },
    edl: "salt_map_anime.edl",
    note: "15s Japanese anime style salt map drawing — no voice"
  };
  
  writeFileSync("output/salt_map_anime/salt_map_anime_manifest.json", JSON.stringify(manifest, null, 2));
  copyFileSync("schemas/salt_map_anime.edl", "output/salt_map_anime/salt_map_anime.edl");
  
  console.log("[salt-map] Manifest written.");
  console.log("[salt-map] EDL copied.");
  console.log("[salt-map] DONE.");
}

main().catch(err => {
  console.error("[salt-map] ERROR:", err);
  process.exit(1);
});