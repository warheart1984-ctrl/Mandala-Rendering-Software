/**
 * Official holographic Simulation Chamber recorder — raw Float32 `.bin` streaming.
 *
 * Usage:
 *   node scripts/simulation-chamber-holo.mjs scene-salt-atlas --holo --creature Mythar \
 *     --mode composite --out output/simulation/holo-mythar-bin/ [--duration 2]
 *
 * Path: buildHolographicBuffers → writeBinFrame → meta.json + watch.html
 * No PNG encode, no sharp, no H.264 by default.
 * Status: bin streaming partial; GPU shader fps declared until watch.html measures on device.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHoloChamber } from "../mandala/engine/chamber/holo-loop.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

function parseArgs(argv) {
  const positional = [];
  const options = {
    creature: "Mythar",
    record: "composite",
    duration: 10,
    fps: 12,
    out: null,
    seed: 21,
    width: 384,
    height: 512,
    sparse: true,
    vision: true,
    visionInterval: 4,
    visionDetail: "medium",
    recordPng: false,
    mp4: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--holo") continue; // accepted for symmetry; this script is always holo
    if (a === "--creature" && argv[i + 1]) options.creature = argv[++i];
    else if (a === "--record" && argv[i + 1]) options.record = argv[++i];
    else if (a === "--mode" && argv[i + 1]) options.record = argv[++i];
    else if (a === "--out" && argv[i + 1]) options.out = argv[++i];
    else if (a === "--duration" && argv[i + 1]) options.duration = parseFloat(argv[++i]);
    else if (a === "--fps" && argv[i + 1]) options.fps = parseInt(argv[++i], 10);
    else if (a === "--seed" && argv[i + 1]) options.seed = parseInt(argv[++i], 10);
    else if (a === "--width" && argv[i + 1]) options.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) options.height = parseInt(argv[++i], 10);
    else if (a === "--sparse") options.sparse = true;
    else if (a === "--no-sparse") options.sparse = false;
    else if (a === "--record-png") options.recordPng = true;
    else if (a === "--mp4") options.mp4 = true;
    else if (a === "--vision") options.vision = true;
    else if (a === "--no-vision") options.vision = false;
    else if (a === "--vision-interval" && argv[i + 1]) options.visionInterval = parseInt(argv[++i], 10);
    else if (a === "--vision-detail" && argv[i + 1]) options.visionDetail = argv[++i];
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    } else positional.push(a);
  }
  return { positional, options };
}

function resolveSceneCard(raw) {
  if (!raw) return null;
  if (existsSync(raw)) return resolve(raw);
  const short = String(raw).replace(/\.json$/i, "");
  const named = join(__dirname, "scene-cards", `${short}.json`);
  if (existsSync(named)) return named;
  const asRepo = resolve(REPO, raw);
  if (existsSync(asRepo)) return asRepo;
  return resolve(raw);
}

const { positional, options } = parseArgs(process.argv.slice(2));
if (positional.length === 0) {
  console.error(
    "Usage: node scripts/simulation-chamber-holo.mjs <scene-card|scene-salt-atlas> [options]",
  );
  console.error("  --creature Mythar --mode composite --out DIR --duration N --fps N");
  console.error("  --sparse (default) | --no-sparse  pre-induced ρ/K cull A/B");
  console.error("  Official raw-float32 .bin path (no PNG / no H.264).");
  process.exit(1);
}

const sceneCardPath = resolveSceneCard(positional[0]);
if (!existsSync(sceneCardPath)) {
  console.error(`Scene card not found: ${sceneCardPath}`);
  process.exit(1);
}
const sceneCard = JSON.parse(readFileSync(sceneCardPath, "utf8"));
const outDir = options.out
  ? resolve(options.out)
  : resolve(REPO, "output/simulation", `holo-${basename(sceneCardPath, ".json")}-bin`);

console.log(`\nSimulation Chamber Holo — official raw .bin recorder`);
console.log("=".repeat(60));
console.log(`  Scene: ${sceneCard.name || sceneCard.id}`);
console.log(`  Creature: ${options.creature}`);
console.log(`  Mode: ${options.record}`);
console.log(`  Out: ${outDir}`);
console.log(`  Status: partial bin streaming; GPU shader fps declared until watch measures.`);
console.log(`  Sparse: ${options.sparse ? "ON (pre-induced cull)" : "OFF (dense A/B)"}`);
  console.log(`  Vision: ${options.vision ? "ON (inspect_image closed-loop)" : "OFF"}${options.vision ? ` interval=${options.visionInterval} detail=${options.visionDetail}` : ""}`);
  console.log(`  PNG: ${options.recordPng ? "ON" : "OFF"} · MP4: ${options.mp4 ? "ON (requires --record-png)" : "OFF"}`);
  console.log(options.recordPng ? "  Codec: COMPOSITE PNG (energy wire mesh)." : "  No PNG encode. No H.264.");

async function main() {
  const holo = await runHoloChamber({
    sceneCard,
    outDir,
    creature: options.creature,
    record: options.record,
    durationSec: Number.isFinite(options.duration) ? options.duration : 10,
    fps: options.fps || 12,
    width: options.width,
    height: options.height,
    seed: options.seed,
    recordPng: options.recordPng,
    mp4: options.mp4 && options.recordPng,
    sparse: options.sparse,
    vision: options.vision,
    visionInterval: options.visionInterval,
    visionDetail: options.visionDetail,
  });

  const framesDir = join(outDir, "frames");
  const bins = existsSync(framesDir)
    ? readdirSync(framesDir).filter((f) => f.endsWith(".bin"))
    : [];
  let totalBytes = 0;
  for (const f of bins) totalBytes += statSync(join(framesDir, f)).size;
  const avgBytes = bins.length ? totalBytes / bins.length : 0;
  const wallMs = holo.receipt.wallMs ?? holo.receipt.ms ?? 0;
  const frameCount = holo.frameCount;
  const msPerFrame = frameCount > 0 ? wallMs / frameCount : 0;
  const genFps = holo.receipt.genFpsEstimate ?? (msPerFrame > 0 ? 1000 / msPerFrame : null);

  console.log(`\n=== Measured (this run) ===`);
  console.log(`  Frames: ${frameCount}`);
  console.log(`  Wall: ${wallMs} ms`);
  console.log(`  ms/frame: ${msPerFrame.toFixed(2)}`);
  if (Number.isFinite(genFps)) console.log(`  Gen fps: ${genFps.toFixed(2)}`);
  console.log(`  Avg .bin: ${(avgBytes / 1024).toFixed(2)} KB (${bins.length} files, ${(totalBytes / 1024).toFixed(1)} KB total)`);
  const sr = holo.receipt.sparseRho || {};
  if (sr.nodeCountFull != null) {
    console.log(
      `  Nodes: full=${sr.nodeCountFull} sparse=${sr.nodeCountSparse} thresh=${sr.sparseRhoThreshold}`,
    );
  }
  if (holo.timing) {
    console.log(`  streaming_io_ms (write): ${holo.timing.streaming_io_ms}`);
    console.log(`  end_to_end_ms: ${holo.timing.end_to_end_ms}`);
    if (holo.timing.avg_vision_ms != null) {
      console.log(`  vision_ms (avg): ${holo.timing.avg_vision_ms}`);
    }
  }
  const vision = holo.receipt.vision || {};
  if (vision.inspected > 0) {
    console.log(`  Vision: ${vision.inspected} frames inspected, ${vision.withAnomalies} anomalies (${vision.anomalyRate * 100}%)`);
  }
  const perception = holo.receipt.perception || {};
  if (perception.cpo) {
    console.log(`  CPO: ${perception.cpo.frames_written} frames written (levels: ${perception.cpo.levels.join(", ")})`);
  }
  if (perception.spo) {
    console.log(`  SPO: ${perception.spo.frames_written} frames written`);
  }
  if (perception.cpf4d) {
    console.log(`  CPF-4D: ${perception.cpf4d.frames_written} frames written`);
  }
  console.log(`  Codec: ${holo.codec || holo.receipt.codec}`);
  console.log(`  Receipt: ${join(outDir, "receipt.json")}`);
  console.log(`  Watch: ${join(outDir, "watch.html")}`);
  console.log(`  CPO Dir: ${join(outDir, "cpo")}`);
  console.log(`  SPO Dir: ${join(outDir, "spo")}`);
  console.log(`  CPF-4D Dir: ${join(outDir, "cpf4d")}`);
  console.log(`  Serve: python3 -m http.server 8765  (cwd=${outDir})`);
  console.log(`  URL: http://127.0.0.1:8765/watch.html`);
  console.log(`  Shader fps: open watch overlay on device — not claimed here.`);

  process.exit(holo.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
