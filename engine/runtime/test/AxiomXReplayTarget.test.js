import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AxiomXReplayTarget } from "../AxiomXReplayTarget.js";
import { ReplayService } from "../ReplayService.js";
import { ProvenanceRecorder, createFrameProvenance } from "../ProvenanceRecorder.js";

function mockRender(frame) {
  const w = frame.parameters.width ?? 64;
  const h = frame.parameters.height ?? 64;
  const spp = frame.parameters.spp ?? 4;
  const seed = frame.parameters.seed ?? 1;
  const t = frame.timeSeconds ?? 0;
  const buf = new Uint8Array(w * h * 4);
  let s = (seed >>> 0) ^ (t * 0x9e3779b9 >>> 0);
  for (let i = 0; i < buf.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    buf[i] = (s >> 24) & 0xff;
  }
  return buf;
}

describe("AxiomXReplayTarget", () => {
  it("applies a governed frame and records render hash", () => {
    const target = new AxiomXReplayTarget({ render: mockRender });
    const frame = createFrameProvenance({
      intentId: 7,
      worldId: 11,
      timelineId: 3,
      timeSeconds: 1.5,
      parameters: { width: 16, height: 16, spp: 4, seed: 42 },
    });
    const entry = target.applyFrame(frame);
    assert.ok(entry.frameHash);
    assert.ok(entry.renderHash.length === 64);
    assert.equal(entry.renderBytes, 16 * 16 * 4);
    assert.equal(target.getRenderLog().length, 1);
  });

  it("rejects frames without intentId/worldId/timelineId (fail closed)", () => {
    const target = new AxiomXReplayTarget({ render: mockRender });
    assert.throws(() => target.applyFrame({}), /intentId required/);
    assert.throws(
      () => target.applyFrame(createFrameProvenance({ intentId: 1 })),
      /worldId required/,
    );
    assert.throws(
      () => target.applyFrame(createFrameProvenance({ intentId: 1, worldId: 1 })),
      /timelineId required/,
    );
  });

  it("throws when no render function is bound", () => {
    const target = new AxiomXReplayTarget();
    const frame = createFrameProvenance({ intentId: 1, worldId: 1, timelineId: 1 });
    assert.throws(() => target.applyFrame(frame), /no render function bound/);
  });

  it("clears the log", () => {
    const target = new AxiomXReplayTarget({ render: mockRender });
    target.applyFrame(createFrameProvenance({ intentId: 1, worldId: 1, timelineId: 1 }));
    target.clear();
    assert.equal(target.getRenderLog().length, 0);
  });
});

describe("engine replay wiring (ReplayService + ProvenanceRecorder + target)", () => {
  function recordFrames(n) {
    const recorder = new ProvenanceRecorder();
    for (let t = 1; t <= n; t++) {
      recorder.record(
        createFrameProvenance({
          intentId: 7,
          worldId: 11,
          timelineId: 3,
          timeSeconds: t,
          parameters: { width: 16, height: 16, spp: 4, seed: 42 },
        }),
      );
    }
    return recorder.getFrames();
  }

  it("replays twice with byte-identical render hashes", () => {
    const frames = recordFrames(5);
    const run1 = new AxiomXReplayTarget({ render: mockRender });
    const run2 = new AxiomXReplayTarget({ render: mockRender });
    ReplayService.replay(frames, run1);
    ReplayService.replay(frames, run2);
    const a = run1.getRenderLog().map((e) => e.renderHash);
    const b = run2.getRenderLog().map((e) => e.renderHash);
    assert.deepEqual(a, b);
    assert.equal(a.length, 5);
  });

  it("produces a lineage receipt over the replay", () => {
    const frames = recordFrames(3);
    const target = new AxiomXReplayTarget({ render: mockRender });
    const receipt = ReplayService.replayWithReceipt(frames, target, { targetId: "ax-target" });
    assert.equal(receipt.kind, "replay-lineage-receipt");
    assert.equal(receipt.frameCount, 3);
    assert.deepEqual(receipt.worldIds, [11]);
    assert.deepEqual(receipt.timelineIds, [3]);
    assert.equal(receipt.frameHashes.length, 3);
  });
});