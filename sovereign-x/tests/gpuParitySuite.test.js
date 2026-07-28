/**
 * Vendor-neutral GPU parity suite — SKELETON / harness toward user contract.
 *
 * Drive-G-1: Does NOT claim enforced CPU↔GPU print parity.
 * SSIM/MSE live cases remain skipped until real plates + backends exist.
 * Stub metrics (SSIM 1.0 / MSE 0.0 / delta* 0) must never be treated as PASS evidence.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadGpuSkillsRegistry,
  route,
  resolveCapability,
} from "../router/index.js";
import {
  mulberry32,
  integrateDeterministicAssist,
} from "../router/modules/gpu/integrator/deterministicGpuIntegrator.js";

/**
 * Stub metrics — labeled skeleton. Do not use as live parity proof.
 * @returns {{ ssim: number, mse: number, deltaLuma: number, deltaChroma: number, status: string }}
 */
function computeMetrics(_a, _b) {
  return {
    ssim: 1.0,
    mse: 0.0,
    deltaLuma: 0.0,
    deltaChroma: 0.0,
    status: "skeleton",
  };
}

describe("Vendor-neutral GPU parity suite (skeleton)", () => {
  it("registry lists GPU assist skills + authoritative print + deterministic integrator", () => {
    const reg = loadGpuSkillsRegistry({ reload: true });
    assert.equal(reg.authoritativePrint, "cpu.rt4d.print");
    assert.ok(reg.skills["gpu.gen.nvidia.nim_flux"]);
    assert.ok(reg.skills["gpu.compute.amd.hip"]);
    assert.ok(reg.skills["gpu.integrator.deterministic"]);
    assert.equal(
      reg.capabilityMeta["gpu.integrator.deterministic"].authority,
      "assist",
    );
    assert.notEqual(
      reg.capabilityMeta["gpu.integrator.deterministic"].authority,
      "authoritative",
    );
  });

  it("computeMetrics stub is explicitly skeleton-labeled (incl. deltaLuma/Chroma)", () => {
    const m = computeMetrics({}, {});
    assert.equal(m.status, "skeleton");
    assert.equal(m.ssim, 1.0);
    assert.equal(m.mse, 0.0);
    assert.equal(m.deltaLuma, 0.0);
    assert.equal(m.deltaChroma, 0.0);
  });

  it("mulberry32 seed contract is deterministic (declared harness)", () => {
    const a = mulberry32(0x4d5253);
    const b = mulberry32(0x4d5253);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it("deterministic integrator is assist-only and denies print SoT", async () => {
    const denied = integrateDeterministicAssist({ asPrintSoT: true, seed: 1 });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "GPU_PRINT_SOT_DENIED");

    const assist = integrateDeterministicAssist({ seed: 42, sampleCount: 4 });
    assert.equal(assist.ok, true);
    assert.equal(assist.assistOnly, true);
    assert.equal(assist.nonAuthoritative, true);
    assert.equal(assist.status, "declared");
    assert.equal(assist.seedContract.prng, "mulberry32");

    const resolved = resolveCapability("gpu.integrator.deterministic");
    assert.equal(resolved.ok, true);
    assert.equal(resolved.authority, "assist");

    const routed = await route("gpu.integrator.deterministic", {
      seed: 7,
      mode: "parity",
    });
    assert.equal(routed.ok, true);
    assert.equal(routed.assistOnly, true);
    assert.equal(routed.nonAuthoritative, true);
  });

  it(
    "CPU vs NVIDIA SSIM/MSE within thresholds",
    { skip: "skeleton: no live GPU plates / parity receipts yet" },
    async () => {
      const scene = { intentId: "test-1", modality: "scene", seed: 1 };
      const cpuPlate = await route("cpu.rt4d.print", scene);
      const nvidiaPlate = await route("gpu.compute.nvidia.cuda", {
        ...scene,
        mode: "parity",
      });
      const metrics = computeMetrics(cpuPlate, nvidiaPlate);
      assert.ok(metrics.ssim >= 0.98);
      assert.ok(metrics.mse <= 0.002);
      assert.ok(metrics.deltaLuma <= 0.01);
      assert.ok(metrics.deltaChroma <= 0.02);
    },
  );

  it(
    "CPU vs AMD SSIM/MSE within thresholds",
    { skip: "skeleton: no live GPU plates / parity receipts yet" },
    async () => {
      const scene = { intentId: "test-2", modality: "scene", seed: 2 };
      const cpuPlate = await route("cpu.rt4d.print", scene);
      const amdPlate = await route("gpu.compute.amd.hip", {
        ...scene,
        mode: "parity",
      });
      const metrics = computeMetrics(cpuPlate, amdPlate);
      assert.ok(metrics.ssim >= 0.98);
      assert.ok(metrics.mse <= 0.002);
      assert.ok(metrics.deltaLuma <= 0.01);
      assert.ok(metrics.deltaChroma <= 0.02);
    },
  );
});
