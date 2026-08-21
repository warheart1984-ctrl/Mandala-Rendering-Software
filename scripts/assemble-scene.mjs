#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";

const OUTPUT_DIR = resolve(import.meta.dirname, "../output/pipeline");
const FFMPEG = resolve(import.meta.dirname, "../runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const FFPROBE = resolve(import.meta.dirname, "../runtime/toolchain/ffmpeg/usr/bin/ffprobe");

function assembleScene(framesDir, audioPath, outputPath, fps = 12) {
  console.log(`  Assembling scene from ${framesDir}`);
  console.log(`  Audio: ${audioPath}`);
  console.log(`  FPS: ${fps}`);

  // Count frames
  const frames = readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort();
  const frameCount = frames.length;
  console.log(`  Frames: ${frameCount}`);

  if (frameCount === 0) {
    console.error("  No frames found");
    return null;
  }

  mkdirSync(outputPath, { recursive: true });
  const tempVideo = resolve(outputPath, "temp-video.mp4");
  const tempAudio = resolve(outputPath, "temp-audio.wav");

  try {
    // Step 1: Encode frames to video
    console.log("  Encoding frames to video...");
    execSync(
      `"${FFMPEG}" -y -framerate ${fps} -i "${framesDir}/frame-%04d.png" ` +
      `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow ` +
      `"${tempVideo}"`,
      { stdio: "pipe" }
    );

    // Step 2: Prepare audio (ensure correct format)
    console.log("  Preparing audio...");
    if (existsSync(audioPath)) {
      execSync(
        `"${FFMPEG}" -y -i "${audioPath}" -ar ${22050} -ac 2 "${tempAudio}"`,
        { stdio: "pipe" }
      );
    } else {
      // Generate silent audio
      const duration = frameCount / fps;
      execSync(
        `"${FFMPEG}" -y -f lavfi -i anullsrc=r=${22050}:cl=stereo -t ${duration} "${tempAudio}"`,
        { stdio: "pipe" }
      );
    }

    // Step 3: Combine video + audio
    console.log("  Combining video and audio...");
    execSync(
      `"${FFMPEG}" -y -i "${tempVideo}" -i "${tempAudio}" ` +
      `-c:v copy -c:a aac -b:a 128k ` +
      `-map 0:v:0 -map 1:a:0 ` +
      `"${outputPath}/scene.mp4"`,
      { stdio: "pipe" }
    );

    console.log(`  Output: ${outputPath}/scene.mp4`);
    return { outputPath: resolve(outputPath, "scene.mp4"), frameCount, fps };

  } catch (err) {
    console.error(`  Assembly error: ${err.message}`);
    return null;
  } finally {
    // Cleanup temp files
    try { execSync(`rm -f "${tempVideo}" "${tempAudio}"`); } catch {}
  }
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node assemble-scene.mjs <frames-dir> <audio.wav> [output-dir] [fps]");
  process.exit(1);
}

const framesDir = resolve(args[0]);
const audioPath = resolve(args[1]);
const outputDir = args[2] ? resolve(args[2]) : resolve(OUTPUT_DIR, "scene-assembled");
const fps = parseInt(args[3]) || 12;

assembleScene(framesDir, audioPath, outputDir, fps);
