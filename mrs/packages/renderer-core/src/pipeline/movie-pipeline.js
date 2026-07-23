/**
 * Movie pipeline — renders frame sequences to PNG and encodes to MP4 via FFmpeg.
 */
import { createCanvas } from "canvas";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { CanvasRenderer } from "../render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../surfaces/index.js";
import { createScene } from "./scene.js";

/**
 * Render a single frame to a PNG buffer.
 */
export function renderFrameToBuffer(mesh, t, scene) {
  const supersample = Math.max(1, Math.min(4, Number(scene.supersample) || 1));
  const canvas = createCanvas(scene.width * supersample, scene.height * supersample);
  const renderer = new CanvasRenderer(canvas, {
    d4: scene.d4,
    d3: scene.d3,
    scale: scene.scale * supersample,
    profile: scene.profile,
    scaleMode: scene.scaleMode,
    padding: scene.padding,
    rotationWeights: scene.rotationWeights,
    background: scene.background,
    renderMode: scene.renderMode,
  });

  renderer.renderFrame(mesh, t, { temporalFraming: scene.temporalFraming });
  if (supersample === 1) return canvas.toBuffer("image/png");
  const output = createCanvas(scene.width, scene.height);
  const ctx = output.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, scene.width, scene.height);
  return output.toBuffer("image/png");
}

export function createFrameSession(mesh, scene) {
  const supersample = Math.max(1, Math.min(4, Number(scene.supersample) || 1));
  const renderCanvas = createCanvas(scene.width * supersample, scene.height * supersample);
  const renderer = new CanvasRenderer(renderCanvas, {
    ...scene, width: scene.width * supersample, height: scene.height * supersample,
    scale: scene.scale * supersample,
  });
  const outputCanvas = supersample > 1 ? createCanvas(scene.width, scene.height) : renderCanvas;
  return {
    render(t) {
      renderer.renderFrame(mesh, t, { temporalFraming: scene.temporalFraming });
      if (supersample > 1) {
        const ctx = outputCanvas.getContext("2d");
        ctx.clearRect(0, 0, scene.width, scene.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(renderCanvas, 0, 0, scene.width, scene.height);
      }
      return outputCanvas.toBuffer("image/png");
    },
  };
}

/**
 * Render a frame sequence to a directory of PNGs.
 * @returns {{ frameCount: number, outputDir: string, elapsed: number }}
 */
export async function renderSequence(scene) {
  const surface = getSurface(scene.surface);
  const mesh = sampleSurface(surface, scene.resolution);
  const session = createFrameSession(mesh, scene);
  const totalFrames = scene.frames;
  const outputDir = path.resolve(scene.outputDir);

  fs.mkdirSync(outputDir, { recursive: true });

  const duration = scene.durationSec ?? totalFrames / scene.fps;
  const startTime = performance.now();

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = (frame / totalFrames) * duration * 2 * Math.PI;
    const buffer = session.render(t);

    const frameNum = String(frame).padStart(6, "0");
    const filename = `${scene.outputPrefix}-${frameNum}.png`;
    fs.writeFileSync(path.join(outputDir, filename), buffer);

    if (frame % 30 === 0 || frame === totalFrames - 1) {
      const pct = ((frame + 1) / totalFrames) * 100;
      process.stdout.write(
        `\r  Rendering: ${frame + 1}/${totalFrames} (${pct.toFixed(1)}%)`
      );
    }
  }

  process.stdout.write("\n");

  const elapsed = (performance.now() - startTime) / 1000;
  return { frameCount: totalFrames, outputDir, elapsed };
}

/**
 * Encode a PNG sequence to MP4 using FFmpeg.
 * @param {string} inputDir - directory containing PNGs
 * @param {string} outputPath - output MP4 path
 * @param {number} fps - frames per second
 * @returns {{ outputPath: string, size: number }}
 */
export function buildFfmpegArgs(inputDir, outputPath, fps = 30, outputPrefix = "frame", codec = "libx264") {
  const absOutput = path.resolve(outputPath);
  const absInput = path.resolve(inputDir);

  return [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(absInput, `${outputPrefix}-%06d.png`),
    "-c:v", codec,
    "-pix_fmt", "yuv420p",
    "-crf", "18",
    "-preset", "slow",
    absOutput,
  ];
}

export function buildFfmpegPipeArgs(outputPath, fps = 30, codec = "libx264") {
  return ["-y", "-f", "image2pipe", "-vcodec", "png", "-framerate", String(fps), "-i", "-", "-c:v", codec, "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", path.resolve(outputPath)];
}

export async function streamMovieToFfmpeg(mesh, scene, outputPath) {
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) throw new Error("FFmpeg not found; direct streaming is unavailable");
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  const child = spawn("ffmpeg", buildFfmpegPipeArgs(outputPath, scene.fps, scene.codec), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = ""; child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => { stderr += chunk; });
  const session = createFrameSession(mesh, scene);
  const duration = scene.durationSec ?? scene.frames / scene.fps;
  for (let frame = 0; frame < scene.frames; frame++) {
    const t = (frame / scene.frames) * duration * 2 * Math.PI;
    if (!child.stdin.write(session.render(t))) await once(child.stdin, "drain");
  }
  child.stdin.end();
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`FFmpeg streaming failed: ${stderr.trim() || `exit ${code}`}`);
  return { outputPath: path.resolve(outputPath), size: fs.statSync(outputPath).size, frames: scene.frames };
}

export function encodeVideo(inputDir, outputPath, fps = 30, outputPrefix = "frame", codec = "libx264") {

  // Check if FFmpeg is available
  try {
    const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    if (probe.error || probe.status !== 0) throw probe.error ?? new Error("FFmpeg probe failed");
  } catch {
    throw new Error(
      "FFmpeg not found. Install FFmpeg and ensure it's in your PATH.\n" +
        "  Windows: https://ffmpeg.org/download.html\n" +
        "  macOS:   brew install ffmpeg\n" +
        "  Linux:   sudo apt install ffmpeg"
    );
  }

  const absOutput = path.resolve(outputPath);
  const result = spawnSync(
    "ffmpeg",
    buildFfmpegArgs(inputDir, absOutput, fps, outputPrefix, codec),
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`FFmpeg encoding failed: ${result.stderr?.trim() || `exit ${result.status}`}`);
  }

  const stats = fs.statSync(absOutput);
  return { outputPath: absOutput, size: stats.size };
}

/**
 * Full pipeline: render frames + encode video.
 * @param {object} sceneOpts - scene options (passed to createScene)
 * @returns {{ pngDir: string, videoPath: string|null, frames: number, elapsed: number }}
 */
export async function renderMovie(sceneOpts = {}) {
  const scene = createScene(sceneOpts);
  const surface = getSurface(scene.surface);

  console.log(`Surface: ${surface.name} (${surface.id})`);
  console.log(`Resolution: ${scene.width}x${scene.height}`);
  console.log(`Render mode: ${scene.renderMode}`);
  console.log(`Frames: ${scene.frames} @ ${scene.fps} fps`);
  console.log(`Mesh: ${scene.resolution}x${scene.resolution} samples`);
  console.log();

  if (scene.streamToFfmpeg) {
    const mp4Path = path.resolve(scene.outputDir, `${surface.id}-${scene.renderMode}.mp4`);
    const result = await streamMovieToFfmpeg(sampleSurface(surface, scene.resolution), scene, mp4Path);
    console.log(`Video streamed directly: ${result.outputPath}`);
    return { pngDir: null, videoPath: result.outputPath, frames: result.frames, elapsed: null };
  }

  // Render PNG sequence
  const { frameCount, outputDir, elapsed } = await renderSequence(scene);
  console.log(`Rendered ${frameCount} frames in ${elapsed.toFixed(2)}s`);

  // Try to encode to MP4
  let videoPath = null;
  try {
    const mp4Path = path.resolve(
      scene.outputDir,
      `${surface.id}-${scene.renderMode}.mp4`
    );
    const { size } = encodeVideo(outputDir, mp4Path, scene.fps, scene.outputPrefix, scene.codec);
    videoPath = mp4Path;
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    console.log(`Video: ${mp4Path} (${sizeMB} MB)`);
  } catch (err) {
    console.log(`Video encoding skipped: ${err.message}`);
    console.log(`PNG sequence saved to: ${outputDir}`);
  }

  return { pngDir: outputDir, videoPath, frames: frameCount, elapsed };
}
