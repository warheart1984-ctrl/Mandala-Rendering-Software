#!/usr/bin/env node
/**
 * Chamber Studio Beat — Story Forge 2-actor beat → 72 canonical envelopes.
 *
 * Records 3 sec @ 24fps into output/simulation/chamber-studio-beat/tape.json + .bin buffers.
 * Replay verifies hash/bufferRef only — NO PNG dependency for replay truth.
 *
 * Usage:
 *   node scripts/chamber-studio-beat.mjs [--png] [--width 512] [--height 512]
 *
 * Status: record/replay enforced; beat JSON partial; PNG viz declared (debug only).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHAMBER_STUDIO_BEAT_STATUS,
  ChamberStudioBeat,
  loadStoryForgeBeat,
  replayTapeFromDisk,
  applyBeatTracks,
  renderDepthMap,
} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";
import { integrateBones } from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/SimulationChamber.js";
import { deformLandmarksFromRig } from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/face-rig-control.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const DEFAULT_BEAT = join(
  REPO,
  "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
);
const OUT_DIR = join(REPO, "output/simulation/chamber-studio-beat");
const PNG_DIR = join(OUT_DIR, "debug-png");

function parseArgs(argv) {
  const opts = {
    width: 512,
    height: 512,
    dt: 1 / 24,
    frames: 72,
    png: false,
    beat: DEFAULT_BEAT,
    out: OUT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--frames" && argv[i + 1]) opts.frames = parseInt(argv[++i], 10);
    else if (a === "--beat" && argv[i + 1]) opts.beat = join(REPO, argv[++i]);
    else if (a === "--out" && argv[i + 1]) opts.out = join(REPO, argv[++i]);
    else if (a === "--png") opts.png = true;
  }
  return opts;
}

function actorSlug(fieldId) {
  return fieldId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32);
}

function syncActorState(actor, frameIndex, dt) {
  applyBeatTracks(actor.beat, actor.rig, frameIndex);
  actor.state.blendshapes = actor.rig.blendshapes;
  integrateBones(actor.state, dt);
  const rig = {
    blendshapes: actor.rig.blendshapes,
    headPos: actor.rig.headPos,
    headRot: actor.rig.headRot,
    fieldId: actor.rig.fieldId,
  };
  const pts = deformLandmarksFromRig(rig);
  actor.state.landmarks = pts.map((p, id) => ({
    id,
    x: p.x,
    y: p.y,
    z: p.z,
    bone: actor.state.landmarks[id]?.bone ?? "jaw",
  }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  if (opts.png) mkdirSync(PNG_DIR, { recursive: true });

  const beat = loadStoryForgeBeat(opts.beat);
  const chamber = new ChamberStudioBeat({
    beat,
    width: opts.width,
    height: opts.height,
    dt: opts.dt,
    outDir: opts.out,
  });

  chamber.record(true);
  for (let i = 0; i < opts.frames; i++) {
    chamber.update(opts.dt);
    if (opts.png && (i === 0 || i === 36 || i === opts.frames - 1)) {
      const pad = String(i).padStart(6, "0");
      for (const actor of chamber.actors) {
        syncActorState(actor, i, opts.dt);
        const depth = renderDepthMap(actor.state, opts.width, opts.height);
        writeFileSync(join(PNG_DIR, `depth-${pad}-${actorSlug(actor.beat.fieldId)}.png`), depth.png);
      }
    }
  }
  chamber.stop();

  const { tapePath, manifest } = chamber.saveTape(opts.out);
  const replayLive = chamber.replay();
  const replayDisk = replayTapeFromDisk(tapePath);

  const provenance = {
    intent: "Story Forge studio beat — 2 actors, 72 envelopes, hash-only replay",
    honest: {
      envelopeModel: CHAMBER_STUDIO_BEAT_STATUS.envelopeModel,
      sourceOfTruth: "tape.json + frame-*.cpf4d.bin + frame-*.actor-*.landmark-z.bin",
      png: opts.png ? "debug viz only — NOT replay truth" : "not emitted",
      beatJson: opts.beat,
      status: CHAMBER_STUDIO_BEAT_STATUS,
    },
    record: {
      beatId: beat.beatId,
      actorCount: beat.actors.length,
      frames: chamber.tape.length,
      dt: opts.dt,
      tapePath,
      tapeHash: manifest.tapeHash,
      replayLiveOk: replayLive.ok,
      replayDiskOk: replayDisk.replay.ok,
    },
  };

  writeFileSync(join(opts.out, "provenance.json"), JSON.stringify(provenance, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: replayLive.ok && replayDisk.replay.ok,
        beatId: beat.beatId,
        actorCount: beat.actors.length,
        frameCount: chamber.tape.length,
        outDir: opts.out,
        tapePath,
        tapeHash: manifest.tapeHash,
        replay: {
          live: replayLive.ok ? "PASS" : "FAIL",
          fromDisk: replayDisk.replay.ok ? "PASS" : "FAIL",
          replayHash: replayDisk.replay.replayHash,
        },
        pngDir: opts.png ? PNG_DIR : null,
        status: CHAMBER_STUDIO_BEAT_STATUS,
      },
      null,
      2,
    ),
  );

  if (!replayLive.ok || !replayDisk.replay.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
