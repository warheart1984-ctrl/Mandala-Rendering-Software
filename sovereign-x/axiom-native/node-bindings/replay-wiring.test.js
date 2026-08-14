/**
 * Live GPU replay wiring — engine ReplayService + ProvenanceRecorder +
 * AxiomXReplayTarget driving the real axiomx addon (uals ABI v0, OpenCL).
 *
 * Evidence for the engine-level temporal replay substrate:
 *  - 5 governed frames recorded, replayed twice through the GPU
 *  - per-frame render hashes byte-identical across replays
 *  - lineage receipt emitted
 *  - fail-closed denial for ungoverned frames
 *
 * Run: node --test replay-wiring.test.js  (needs uals.dll + axiomx.node built)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const addon = require("./build/Release/axiomx.node");

const engineRuntime = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "engine", "runtime",
);
const { ReplayService } = await import(pathToFileURL(join(engineRuntime, "ReplayService.js")));
const { ProvenanceRecorder, createFrameProvenance } = await import(
  pathToFileURL(join(engineRuntime, "ProvenanceRecorder.js"))
);
const { AxiomXReplayTarget } = await import(pathToFileURL(join(engineRuntime, "AxiomXReplayTarget.js")));

function renderViaAddon(frame) {
  return addon.renderAxiomX({
    seed: frame.parameters.seed ?? 1,
    spp: frame.parameters.spp ?? 4,
    width: frame.parameters.width ?? 64,
    height: frame.parameters.height ?? 64,
    intentId: frame.intentId,
    worldId: frame.worldId,
    timelineId: frame.timelineId,
    timeSeconds: frame.timeSeconds,
  });
}

describe("live GPU replay wiring (engine -> axiomx addon)", () => {
  it("GPU probe exposes Ellesmere-class device", () => {
    const [d] = addon.probe();
    assert.ok(d.name.length > 0);
    assert.ok(d.globalMemBytes > 0);
  });

  it("records 5 frames, replays twice, byte-identical render hashes", () => {
    const recorder = new ProvenanceRecorder();
    for (let t = 1; t <= 5; t++) {
      recorder.record(
        createFrameProvenance({
          intentId: 7,
          worldId: 11,
          timelineId: 3,
          timeSeconds: t,
          parameters: { width: 64, height: 64, spp: 4, seed: 0x5eed },
        }),
      );
    }
    const frames = recorder.getFrames();
    const run1 = new AxiomXReplayTarget({ render: renderViaAddon });
    const run2 = new AxiomXReplayTarget({ render: renderViaAddon });
    ReplayService.replay(frames, run1);
    ReplayService.replay(frames, run2);
    const a = run1.getRenderLog().map((e) => e.renderHash);
    const b = run2.getRenderLog().map((e) => e.renderHash);
    assert.deepEqual(a, b);
    assert.equal(a.length, 5);
    for (const e of run1.getRenderLog()) assert.equal(e.renderHash.length, 64);
  });

  it("timeSeconds is provenance, not a sampling input (stable render, distinct frame hashes)", () => {
    const frames = [1, 2, 3, 4, 5].map((t) =>
      createFrameProvenance({
        intentId: 7, worldId: 11, timelineId: 3, timeSeconds: t,
        parameters: { width: 64, height: 64, spp: 4, seed: 0x5eed },
      }),
    );
    const target = new AxiomXReplayTarget({ render: renderViaAddon });
    ReplayService.replay(frames, target);
    const log = target.getRenderLog();
    // Same seed + params => byte-identical render across timeSeconds (replayability).
    assert.equal(new Set(log.map((e) => e.renderHash)).size, 1);
    // Time still marks each frame's provenance identity.
    assert.equal(new Set(log.map((e) => e.frameHash)).size, 5);
  });

  it("emits a lineage receipt over the replay", () => {
    const frames = [1, 2, 3].map((t) =>
      createFrameProvenance({
        intentId: 7, worldId: 11, timelineId: 3, timeSeconds: t,
        parameters: { width: 32, height: 32, spp: 4, seed: 1 },
      }),
    );
    const target = new AxiomXReplayTarget({ render: renderViaAddon });
    const receipt = ReplayService.replayWithReceipt(frames, target, { targetId: "axiomx-live" });
    assert.equal(receipt.kind, "replay-lineage-receipt");
    assert.equal(receipt.frameCount, 3);
    assert.deepEqual(receipt.worldIds, [11]);
    assert.deepEqual(receipt.timelineIds, [3]);
    assert.equal(receipt.frameHashes.length, 3);
  });

  it("fails closed on an ungoverned frame (no intentId)", () => {
    const target = new AxiomXReplayTarget({ render: renderViaAddon });
    assert.throws(
      () => target.applyFrame({ timeSeconds: 1, parameters: { width: 8, height: 8, spp: 1, seed: 1 } }),
      /intentId required/,
    );
  });
});