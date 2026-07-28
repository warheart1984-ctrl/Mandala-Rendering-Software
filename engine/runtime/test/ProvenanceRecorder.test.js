import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFrameProvenance,
  ProvenanceRecorder,
} from "../ProvenanceRecorder.js";

describe("createFrameProvenance()", () => {
  it("returns object with all 5 required fields", () => {
    const f = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 2.5,
      parameters: { speed: 3 },
    });
    assert.equal(f.intentId, "i1");
    assert.equal(f.timelineId, "t1");
    assert.equal(f.worldId, "w1");
    assert.equal(f.timeSeconds, 2.5);
    assert.deepEqual(f.parameters, { speed: 3 });
  });

  it("defaults missing fields to null/0/{}", () => {
    const f = createFrameProvenance({});
    assert.equal(f.intentId, null);
    assert.equal(f.timelineId, null);
    assert.equal(f.worldId, null);
    assert.equal(f.timeSeconds, 0);
    assert.deepEqual(f.parameters, {});
  });

  it("copies parameters (not a reference)", () => {
    const params = { speed: 1 };
    const f = createFrameProvenance({ parameters: params });
    params.speed = 999;
    assert.equal(f.parameters.speed, 1);
  });

  it("accepts explicit null values", () => {
    const f = createFrameProvenance({
      intentId: null,
      timelineId: null,
      worldId: null,
      timeSeconds: 0,
    });
    assert.equal(f.intentId, null);
    assert.equal(f.timelineId, null);
    assert.equal(f.worldId, null);
  });
});

describe("ProvenanceRecorder", () => {
  it("starts with count 0", () => {
    const rec = new ProvenanceRecorder();
    assert.equal(rec.count, 0);
  });

  it("record() increments count", () => {
    const rec = new ProvenanceRecorder();
    rec.record(createFrameProvenance({ intentId: "i1" }));
    assert.equal(rec.count, 1);
    rec.record(createFrameProvenance({ intentId: "i2" }));
    assert.equal(rec.count, 2);
  });

  it("getFrames() returns a copy (not a reference)", () => {
    const rec = new ProvenanceRecorder();
    rec.record(createFrameProvenance({ intentId: "i1" }));
    const frames = rec.getFrames();
    frames.push(createFrameProvenance({ intentId: "i2" }));
    assert.equal(rec.count, 1);
  });

  it("getFrames() returns recorded frames in order", () => {
    const rec = new ProvenanceRecorder();
    const f1 = createFrameProvenance({ intentId: "i1", timeSeconds: 0 });
    const f2 = createFrameProvenance({ intentId: "i2", timeSeconds: 1 });
    rec.record(f1);
    rec.record(f2);
    const frames = rec.getFrames();
    assert.equal(frames[0].intentId, "i1");
    assert.equal(frames[1].intentId, "i2");
  });

  it("clear() resets count to 0", () => {
    const rec = new ProvenanceRecorder();
    rec.record(createFrameProvenance({ intentId: "i1" }));
    rec.record(createFrameProvenance({ intentId: "i2" }));
    rec.clear();
    assert.equal(rec.count, 0);
  });

  it("clear() empties getFrames()", () => {
    const rec = new ProvenanceRecorder();
    rec.record(createFrameProvenance({ intentId: "i1" }));
    rec.clear();
    assert.deepEqual(rec.getFrames(), []);
  });

  it("exportJson() returns valid JSON string", () => {
    const rec = new ProvenanceRecorder();
    rec.record(createFrameProvenance({ intentId: "i1", worldId: "w1" }));
    const json = rec.exportJson();
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.frames));
    assert.equal(parsed.frames.length, 1);
    assert.equal(parsed.frames[0].intentId, "i1");
    assert.equal(parsed.frames[0].worldId, "w1");
  });

  it("exportJson() produces empty frames array when empty", () => {
    const rec = new ProvenanceRecorder();
    const parsed = JSON.parse(rec.exportJson());
    assert.deepEqual(parsed.frames, []);
  });

  it("records many frames without corruption", () => {
    const rec = new ProvenanceRecorder();
    for (let i = 0; i < 100; i++) {
      rec.record(
        createFrameProvenance({
          intentId: `i-${i}`,
          timeSeconds: i * 0.1,
          parameters: { index: i },
        }),
      );
    }
    assert.equal(rec.count, 100);
    const frames = rec.getFrames();
    assert.equal(frames[99].intentId, "i-99");
    assert.equal(frames[99].parameters.index, 99);
  });

  it("frame parameters are independent copies", () => {
    const rec = new ProvenanceRecorder();
    const params = { speed: 1 };
    rec.record(createFrameProvenance({ intentId: "i1", parameters: params }));
    params.speed = 999;
    assert.equal(rec.getFrames()[0].parameters.speed, 1);
  });
});

describe("hashFrameProvenance()", () => {
  it("is deterministic for identical fields", () => {
    const a = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 1.5,
      parameters: { b: 2, a: 1 },
    });
    const b = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 1.5,
      parameters: { a: 1, b: 2 },
    });
    assert.equal(a.provenanceHash, b.provenanceHash);
    assert.match(a.provenanceHash, /^[0-9a-f]{64}$/);
  });

  it("changes when any constitutional field changes", () => {
    const base = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 1,
      parameters: { speed: 1 },
    });
    const changed = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 2,
      parameters: { speed: 1 },
    });
    assert.notEqual(base.provenanceHash, changed.provenanceHash);
  });
});
