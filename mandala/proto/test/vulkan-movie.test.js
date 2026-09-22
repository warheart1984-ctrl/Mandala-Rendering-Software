import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runVulkanMovie } from "../vulkan-movie.mjs";

describe("AAIS Vulkan slice movie", () => {
  it("draws frames on Vulkan, matches the CPU slice, and encodes mp4", () => {
    const outDir = join(tmpdir(), "mandala-vulkan-movie-test");
    const receipt = runVulkanMovie({
      seed: 7,
      frames: 4,
      width: 64,
      height: 64,
      fps: 8,
      outDir,
    });
    assert.equal(receipt.aaisRejected, 0);
    assert.equal(receipt.committedSteps, 3);
    assert.equal(receipt.renderDidNotMutate, true);
    assert.equal(receipt.cpuAgreement, true);
    assert.ok(receipt.maxAbsError <= 1);
    assert.equal(receipt.encoded, true);
    assert.ok(existsSync(receipt.mp4));
    assert.ok(["cpu", "discrete", "integrated", "virtual"].includes(receipt.deviceType));
    assert.ok(receipt.device);
  });
});
