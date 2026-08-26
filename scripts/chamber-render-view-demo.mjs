#!/usr/bin/env node
/**
 * Same tape, two skins — chamber truth unchanged, RenderView projection only.
 *
 * Loads output/simulation/chamber-studio-beat/tape.json (or records 12 frames if missing),
 * replays envelope hashes, exports physical vs anime LUT PNGs per frame.
 *
 * Usage:
 *   node scripts/chamber-render-view-demo.mjs
 *   node scripts/chamber-render-view-demo.mjs --frame 0
 *   node scripts/chamber-render-view-demo.mjs --frames 12 --record-if-missing
 *   node scripts/chamber-render-view-demo.mjs --anime-sd   # optional sd-server img2img
 *
 * Output:
 *   output/simulation/chamber-studio-beat/view-physical/frame-NNNNNN.png
 *   output/simulation/chamber-studio-beat/view-anime/frame-NNNNNN.png
 *
 * Status: partial — CPU LUT enforced; anime SD requires sd-server @ :13306
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRenderView,
  loadChamberFrame,
  replayTapeFromDisk,
  recordStudioBeat,
} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const DEFAULT_TAPE = join(REPO, "output/simulation/chamber-studio-beat/tape.json");
const BEAT_PATH = join(
  REPO,
  "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
);

function parseArgs(argv) {
  const opts = {
    tape: DEFAULT_TAPE,
    frame: null,
    frames: null,
    recordIfMissing: false,
    animeSd: false,
    width: null,
    height: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tape" && argv[i + 1]) opts.tape = join(REPO, argv[++i]);
    else if (a === "--frame" && argv[i + 1]) opts.frame = parseInt(argv[++i], 10);
    else if (a === "--frames" && argv[i + 1]) opts.frames = parseInt(argv[++i], 10);
    else if (a === "--record-if-missing") opts.recordIfMissing = true;
    else if (a === "--anime-sd") opts.animeSd = true;
    else if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
  }
  return opts;
}

function ensureTape(opts) {
  if (existsSync(opts.tape)) return opts.tape;
  if (!opts.recordIfMissing) {
    throw new Error(`tape missing: ${opts.tape} (pass --record-if-missing to record 12 frames)`);
  }
  const outDir = dirname(opts.tape);
  mkdirSync(outDir, { recursive: true });
  recordStudioBeat({
    beatPath: BEAT_PATH,
    width: opts.width ?? 64,
    height: opts.height ?? 64,
    frames: opts.frames ?? 12,
    outDir,
  });
  return opts.tape;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tapePath = ensureTape(opts);
  const tapeRoot = dirname(tapePath);
  const { manifest, replay } = replayTapeFromDisk(tapePath);

  const outPhysical = join(tapeRoot, "view-physical");
  const outAnime = join(tapeRoot, "view-anime");
  mkdirSync(outPhysical, { recursive: true });
  mkdirSync(outAnime, { recursive: true });

  const renderView = createRenderView({ mode: "physical" });
  const frames = manifest.frames ?? [];
  const indices = opts.frame != null
    ? [opts.frame]
    : frames
        .slice(0, opts.frames ?? frames.length)
        .map((f) => f.frameIndex);

  const results = [];

  for (const idx of indices) {
    const frame = frames.find((f) => f.frameIndex === idx);
    if (!frame) continue;

    const loaded = loadChamberFrame(frame, { tapeRoot });
    const pad = String(idx).padStart(6, "0");
    const envelopeHash = loaded.envelopeHash;

    const physical = renderView.project(loaded, { mode: "physical" });
    const physicalPath = join(outPhysical, `frame-${pad}.png`);
    writeFileSync(physicalPath, physical.png);

    let anime;
    if (opts.animeSd) {
      anime = await renderView.projectAsync(loaded, { mode: "anime", animePath: "sd", useSd: true });
    } else {
      anime = renderView.project(loaded, { mode: "anime" });
    }
    const animePath = join(outAnime, `frame-${pad}.png`);
    writeFileSync(animePath, anime.png);

    const sameEnvelope = physical.envelopeHash === anime.envelopeHash;
    const distinctPng = !physical.png.equals(anime.png);

    results.push({
      frameIndex: idx,
      envelopeHash,
      sameEnvelope,
      distinctPng,
      physical: physicalPath,
      anime: animePath,
      animeSubMode: anime.subMode ?? "toon-lut",
    });
  }

  const summary = {
    ok: replay.ok && results.every((r) => r.sameEnvelope && r.distinctPng),
    tapePath,
    tapeHash: manifest.tapeHash,
    replayOk: replay.ok,
    frameCount: results.length,
    outPhysical,
    outAnime,
    proof: "same envelopeHash per frame, different PNG export",
    results,
    status: {
      chamber: "enforced — replay hash verification unchanged",
      renderView: opts.animeSd ? "partial — anime SD or LUT fallback" : "partial — CPU LUT",
    },
  };

  writeFileSync(join(tapeRoot, "render-view-demo.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
