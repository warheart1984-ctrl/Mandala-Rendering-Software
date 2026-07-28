import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReplayService } from "../ReplayService.js";
import { createFrameProvenance, hashFrameProvenance } from "../ProvenanceRecorder.js";

describe("ReplayService", () => {
  it("replay() calls applyFrame on target for each frame", () => {
    const frames = [
      createFrameProvenance({ intentId: "i1", timeSeconds: 0, parameters: { speed: 1 } }),
      createFrameProvenance({ intentId: "i2", timeSeconds: 1, parameters: { speed: 2 } }),
    ];
    const applied = [];
    const target = {
      applyFrame(f) {
        applied.push(f);
      },
    };
    ReplayService.replay(frames, target);
    assert.equal(applied.length, 2);
    assert.equal(applied[0].intentId, "i1");
    assert.equal(applied[1].intentId, "i2");
  });

  it("replay() restores exact parameter values", () => {
    const frames = [
      createFrameProvenance({ intentId: "i1", timeSeconds: 0, parameters: { speed: 1.5, rotation: 42 } }),
      createFrameProvenance({ intentId: "i2", timeSeconds: 1, parameters: { speed: 2.5, rotation: 84 } }),
    ];
    const captured = [];
    const target = {
      applyFrame(f) {
        captured.push({ ...f.parameters });
      },
    };
    ReplayService.replay(frames, target);
    assert.equal(captured[0].speed, 1.5);
    assert.equal(captured[0].rotation, 42);
    assert.equal(captured[1].speed, 2.5);
    assert.equal(captured[1].rotation, 84);
  });

  it("replay() processes frames in order", () => {
    const frames = [
      createFrameProvenance({ intentId: "i1", timeSeconds: 0, parameters: { step: "first" } }),
      createFrameProvenance({ intentId: "i2", timeSeconds: 0.5, parameters: { step: "second" } }),
      createFrameProvenance({ intentId: "i3", timeSeconds: 1, parameters: { step: "third" } }),
    ];
    const order = [];
    const target = {
      applyFrame(f) {
        order.push(f.parameters.step);
      },
    };
    ReplayService.replay(frames, target);
    assert.deepEqual(order, ["first", "second", "third"]);
  });

  it("replay() does nothing if frames is null", () => {
    let called = false;
    const target = { applyFrame() { called = true; } };
    ReplayService.replay(null, target);
    assert.equal(called, false);
  });

  it("replay() does nothing if frames is undefined", () => {
    let called = false;
    const target = { applyFrame() { called = true; } };
    ReplayService.replay(undefined, target);
    assert.equal(called, false);
  });

  it("replay() does nothing if target is null", () => {
    const frames = [createFrameProvenance({ intentId: "i1" })];
    // Should not throw
    ReplayService.replay(frames, null);
  });

  it("replay() does nothing if target lacks applyFrame", () => {
    const frames = [createFrameProvenance({ intentId: "i1" })];
    ReplayService.replay(frames, {});
  });

  it("replay() handles empty frames array", () => {
    let called = false;
    const target = { applyFrame() { called = true; } };
    ReplayService.replay([], target);
    assert.equal(called, false);
  });

  it("replay() passes full frame object (not just parameters)", () => {
    const frame = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 2.5,
      parameters: { speed: 3 },
    });
    let received = null;
    const target = {
      applyFrame(f) { received = f; },
    };
    ReplayService.replay([frame], target);
    assert.equal(received.intentId, "i1");
    assert.equal(received.timelineId, "t1");
    assert.equal(received.worldId, "w1");
    assert.equal(received.timeSeconds, 2.5);
    assert.deepEqual(received.parameters, { speed: 3 });
  });

  it("replay() with 100 frames applies all of them", () => {
    const frames = [];
    for (let i = 0; i < 100; i++) {
      frames.push(
        createFrameProvenance({
          intentId: `i-${i}`,
          timeSeconds: i * 0.01,
          parameters: { index: i },
        }),
      );
    }
    let count = 0;
    const target = {
      applyFrame() { count++; },
    };
    ReplayService.replay(frames, target);
    assert.equal(count, 100);
  });

  it("createLineageReceipt() includes frame hashes and world/timeline ids", () => {
    const frames = [
      createFrameProvenance({
        intentId: "i1",
        timelineId: "t1",
        worldId: "w1",
        timeSeconds: 0,
        parameters: { speed: 1 },
      }),
      createFrameProvenance({
        intentId: "i2",
        timelineId: "t1",
        worldId: "w1",
        timeSeconds: 1,
        parameters: { speed: 2 },
      }),
    ];
    const receipt = ReplayService.createLineageReceipt(frames, {
      targetId: "target-a",
      evidenceRefs: ["ev-1"],
    });
    assert.equal(receipt.kind, "replay-lineage-receipt");
    assert.equal(receipt.frameCount, 2);
    assert.equal(receipt.frameHashes.length, 2);
    assert.equal(receipt.frameHashes[0], frames[0].provenanceHash);
    assert.equal(receipt.frameHashes[0], hashFrameProvenance(frames[0]));
    assert.deepEqual(receipt.worldIds, ["w1"]);
    assert.deepEqual(receipt.timelineIds, ["t1"]);
    assert.equal(receipt.targetId, "target-a");
    assert.deepEqual(receipt.evidenceRefs, ["ev-1"]);
  });

  it("replayWithReceipt() applies frames and returns receipt", () => {
    const frames = [
      createFrameProvenance({ intentId: "i1", worldId: "w1", timelineId: "t1" }),
    ];
    let applied = 0;
    const receipt = ReplayService.replayWithReceipt(
      frames,
      { applyFrame() { applied++; } },
      { targetId: "t" },
    );
    assert.equal(applied, 1);
    assert.equal(receipt.frameCount, 1);
  });
});
