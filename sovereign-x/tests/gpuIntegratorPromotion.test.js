/**
 * GPU Integrator Promotion Suite — SKELETON / harness.
 *
 * Drive-G-1:
 * - Live CPU↔GPU parity threshold asserts are SKIPPED (no plates / no false-PASS).
 * - Same-host replay may PASS on deterministic stub receipt hashes only.
 * - Stub SSIM 1.0 / MSE 0.0 must never be treated as measured parity evidence.
 * - Does not authorize GPU print SoT or registry reclassification.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "../router/index.js";

/**
 * @param {object} scene
 */
async function renderCpu(scene) {
  return route("cpu.rt4d.print", {
    ...scene,
    determinismRequired: true,
  });
}

/**
 * @param {object} scene
 */
async function renderGpuIntegrator(scene) {
  return route("gpu.integrator.deterministic", {
    ...scene,
    mode: "parity",
    determinismRequired: false,
  });
}

/**
 * Stub metrics — labeled skeleton. Do not use as live parity proof.
 * @returns {{ ssim: number, mse: number, deltaLuma: number, deltaChroma: number, status: string }}
 */
function computeMetrics(_cpuPlate, _gpuPlate) {
  return {
    ssim: 1.0,
    mse: 0.0,
    deltaLuma: 0.0,
    deltaChroma: 0.0,
    status: "skeleton",
  };
}

describe("GPU Integrator Promotion Suite (skeleton)", () => {
  const scene = {
    intentId: "promotion-scene-001",
    modality: "scene",
    seed: 123456789,
    spp: 64,
    maxDepth: 8,
    sampleCount: 8,
  };

  it("computeMetrics stub is explicitly skeleton-labeled", () => {
    const m = computeMetrics({}, {});
    assert.equal(m.status, "skeleton");
  });

  it(
    "meets parity thresholds vs CPU RT4D",
    {
      skip:
        "skeleton: no live GPU plates / parity receipts — do not false-PASS on stub SSIM 1.0",
    },
    async () => {
      const cpuPlate = await renderCpu(scene);
      const gpu = await renderGpuIntegrator(scene);
      const metrics = computeMetrics(cpuPlate, gpu.plate);
      assert.ok(metrics.ssim >= 0.98);
      assert.ok(metrics.mse <= 0.002);
      assert.ok(metrics.deltaLuma <= 0.005);
      assert.ok(metrics.deltaChroma <= 0.005);
      assert.equal(gpu.receipt.seed, scene.seed);
      assert.equal(typeof gpu.receipt.frameHash, "string");
      assert.equal(typeof gpu.receipt.replayHash, "string");
    },
  );

  it("replays deterministically on same host (stub receipt hashes)", async () => {
    const first = await renderGpuIntegrator(scene);
    const second = await renderGpuIntegrator(scene);
    assert.equal(first.ok, true);
    assert.equal(first.assistOnly, true);
    assert.equal(first.nonAuthoritative, true);
    assert.equal(first.receipt.status, "skeleton");
    assert.equal(first.receipt.frameHash, second.receipt.frameHash);
    assert.equal(first.receipt.replayHash, second.receipt.replayHash);
    assert.equal(first.receipt.seed, scene.seed >>> 0);
  });

  it("denies GPU print SoT via integrator route", async () => {
    const denied = await route("gpu.integrator.deterministic", {
      ...scene,
      asPrintSoT: true,
    });
    assert.equal(denied.ok, false);
    assert.ok(
      denied.code === "GPU_PRINT_SAFEGUARD" ||
        denied.code === "GPU_PRINT_SOT_DENIED",
      `unexpected code ${denied.code}`,
    );
  });
});
