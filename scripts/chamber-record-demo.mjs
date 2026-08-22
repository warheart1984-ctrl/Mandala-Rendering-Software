#!/usr/bin/env node
/**
 * SimulationChamber record demo — canonical tape, NOT flipbook.
 *
 * Records 8–16 frames @ dt=1/24 into output/chamber-tape/tape.json + .bin buffers.
 * Optional PNG debug viz (depth/topology) — honest: PNG is comparison viz, tape is SoT.
 *
 * Usage:
 *   node scripts/chamber-record-demo.mjs [--frames 12] [--width 512] [--height 512] [--png]
 *
 * Status: record/replay enforced; PNG viz partial (debug only); SD-Turbo loop declared.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SIMULATION_CHAMBER_STATUS,
  SimulationChamber,
  createDefaultFaceRig,
  renderDepthMap,
  renderColoredByBone,
  ARKIT_BLENDSHAPE_NAMES,
} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "output/chamber-tape");
const PNG_DIR = join(OUT_DIR, "debug-png");

function blendIndex(name) {
  return ARKIT_BLENDSHAPE_NAMES.indexOf(name);
}

function parseArgs(argv) {
  const opts = { frames: 12, width: 512, height: 512, dt: 1 / 24, png: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frames" && argv[i + 1]) opts.frames = parseInt(argv[++i], 10);
    else if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--dt" && argv[i + 1]) opts.dt = parseFloat(argv[++i]);
    else if (a === "--png") opts.png = true;
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = opts.out ? join(REPO, opts.out) : OUT_DIR;
  mkdirSync(outDir, { recursive: true });
  if (opts.png) mkdirSync(PNG_DIR, { recursive: true });

  const rig = createDefaultFaceRig("chamber-record-demo");
  const chamber = new SimulationChamber({
    rig,
    width: opts.width,
    height: opts.height,
    dt: opts.dt,
    outDir,
    briefId: "chamber-record-demo",
  });

  chamber.record(true);
  const jawIdx = blendIndex("jawOpen");
  const browIdx = blendIndex("browInnerUp");

  /** @type {object[]} */
  const stepLog = [];

  for (let i = 0; i < opts.frames; i++) {
    if (jawIdx >= 0) {
      rig.blendshapes[jawIdx] = 0.12 + 0.15 * Math.sin(i * 0.35);
    }
    if (browIdx >= 0) {
      rig.blendshapes[browIdx] = 0.05 + 0.08 * Math.cos(i * 0.25);
    }

    const step = chamber.update(opts.dt);
    stepLog.push({
      frame: i,
      time: step.time,
      pathSamples: step.paths.length,
      envelopeHash: step.envelope.hashes.envelopeHash,
      landmarkZMin: Math.min(...step.landmarkZ),
      landmarkZMax: Math.max(...step.landmarkZ),
    });

    if (opts.png && (i === 0 || i === opts.frames - 1)) {
      const pad = String(i).padStart(3, "0");
      const stateForRender = { ...chamber.state, landmarks: chamber.state.landmarks };
      const depth = renderDepthMap(stateForRender, opts.width, opts.height);
      const topo = renderColoredByBone(stateForRender, opts.width, opts.height);
      writeFileSync(join(PNG_DIR, `depth-${pad}.png`), depth.png);
      writeFileSync(join(PNG_DIR, `topology-${pad}.png`), topo.png);
    }
  }

  chamber.stop();
  const { tapePath, manifest } = chamber.saveTape(outDir);
  const replay = chamber.replay();

  const provenance = {
    intent: "recordable SimulationChamber — state + dt + canonical tape",
    honest: {
      sourceOfTruth: "tape.json + frame-*.cpf4d.bin + frame-*.landmark-z.bin",
      png: opts.png ? "debug viz only — NOT the recording format" : "not emitted",
      flipbook: "not used",
      sdTurbo: "declared — depth+flow+topology loop not run in this demo",
      chamber: SIMULATION_CHAMBER_STATUS,
    },
    record: {
      frames: opts.frames,
      dt: opts.dt,
      width: opts.width,
      height: opts.height,
      tapePath,
      tapeHash: manifest.tapeHash,
      replayOk: replay.ok,
    },
    steps: stepLog,
    status: SIMULATION_CHAMBER_STATUS,
  };

  writeFileSync(join(outDir, "provenance.json"), JSON.stringify(provenance, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir,
        tapePath,
        frameCount: manifest.frameCount,
        tapeHash: manifest.tapeHash,
        replayOk: replay.ok,
        pngDir: opts.png ? PNG_DIR : null,
        status: SIMULATION_CHAMBER_STATUS,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
