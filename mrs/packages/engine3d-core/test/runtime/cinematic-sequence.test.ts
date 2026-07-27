/**
 * Timeline interpolation + cinematic short-sequence tests.
 * Status: **enforced** for math; sequence smoke is **prepared**.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateTrack,
  slerp,
  defaultOrbitTimeline,
  assertValidTimeline,
  frameCount,
} from "../../src/timeline/index.js";
import { Engine3DCinematicRuntime } from "../../src/runtime/Engine3DCinematicRuntime.js";
import { MemoryModel8k } from "../../src/runtime/MemoryModel8k.js";
import { RenderFarmController } from "../../src/farm/RenderFarmController.js";

describe("keyframe interpolation", () => {
  it("step holds left value", () => {
    const v = evaluateTrack(
      [
        { time: 0, value: 1, interp: "step" },
        { time: 1, value: 3, interp: "step" },
      ],
      0.5,
    );
    assert.equal(v, 1);
  });

  it("linear floats deterministically", () => {
    const v = evaluateTrack(
      [
        { time: 0, value: 0, interp: "linear" },
        { time: 2, value: 10, interp: "linear" },
      ],
      1,
    );
    assert.equal(v, 5);
  });

  it("linear vec3", () => {
    const v = evaluateTrack(
      [
        { time: 0, value: [0, 0, 0], interp: "linear" },
        { time: 1, value: [2, 4, 6], interp: "linear" },
      ],
      0.5,
    );
    assert.deepEqual(v, [1, 2, 3]);
  });

  it("cubic is between endpoints at mid", () => {
    const v = evaluateTrack(
      [
        { time: 0, value: 0, interp: "cubic" },
        { time: 1, value: 10, interp: "cubic" },
      ],
      0.5,
    );
    assert.equal(typeof v, "number");
    assert.ok((v as number) > 0 && (v as number) < 10);
  });

  it("slerp identity at t=0 and t=1", () => {
    const a: [number, number, number, number] = [0, 0, 0, 1];
    const b: [number, number, number, number] = [0, 1, 0, 0];
    assert.deepEqual(slerp(a, b, 0), a);
    const end = slerp(a, b, 1);
    assert.ok(Math.abs(end[1]! - 1) < 1e-9);
    assert.ok(Math.abs(end[3]!) < 1e-9);
  });

  it("spherical track evaluates quat", () => {
    const v = evaluateTrack(
      [
        { time: 0, value: [0, 0, 0, 1], interp: "spherical" },
        { time: 1, value: [0, 1, 0, 0], interp: "spherical" },
      ],
      0,
    );
    assert.deepEqual(v, [0, 0, 0, 1]);
  });

  it("rejects empty track keyframes via assertValidTimeline", () => {
    assert.throws(() =>
      assertValidTimeline({
        id: "bad",
        duration: 1,
        fps: 24,
        tracks: [{ id: "t", target: "camera", property: "eye", keyframes: [] }],
      }),
    );
  });
});

describe("Engine3DCinematicRuntime", () => {
  it("renders frame-range soft-raster sequence", () => {
    const dir = mkdtempSync(join(tmpdir(), "e3d-seq-"));
    try {
      const timeline = defaultOrbitTimeline({ duration: 0.5, fps: 4 });
      assert.equal(frameCount(timeline), 2);
      const record = new Engine3DCinematicRuntime({
        timeline,
        outputDir: dir,
        width: 48,
        height: 36,
        frameStart: 0,
        frameEnd: 1,
      }).runSequence();
      assert.equal(record.frame_count, 2);
      assert.equal(record.structure_source, "engine3d_raster");
      assert.ok(existsSync(record.frames[0]!.beauty_path));
      assert.ok(existsSync(record.frames[0]!.final_path));
      assert.ok(existsSync(record.frames[1]!.beauty_path));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("farm + memory skeletons", () => {
  it("splits sequence into deterministic chunks", () => {
    const farm = new RenderFarmController();
    farm.registerNode({ id: "n1", address: "local", status: "idle" });
    const jobs = farm.submitSequence("seq", 10, 4);
    assert.deepEqual(
      jobs.map((j) => [j.frameStart, j.frameEnd]),
      [
        [0, 3],
        [4, 7],
        [8, 9],
      ],
    );
  });

  it("8k budget validates frame rgba size", () => {
    const b = MemoryModel8k.for8k();
    assert.equal(b.maxFrameBytes, 7680 * 4320 * 4);
    MemoryModel8k.validateFrame(1000, b);
    assert.throws(() => MemoryModel8k.validateFrame(b.maxFrameBytes + 1, b));
  });
});
