/**
 * Live WebGPU smoke — skip when no adapter (CPU-only CI must not fail).
 * STATUS: live enforcement **partial** unless a GPU runner is present.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostProcessor } from "../../src/gpu/PostProcessor.js";
import { ShadowMapper } from "../../src/gpu/ShadowMapper.js";
import { EnvironmentMapper } from "../../src/gpu/EnvironmentMapper.js";

async function tryRequestAdapter() {
  const nav = globalThis.navigator;
  if (!nav?.gpu || typeof nav.gpu.requestAdapter !== "function") {
    return null;
  }
  try {
    return await nav.gpu.requestAdapter();
  } catch {
    return null;
  }
}

describe("gpu-live — adapter presence", () => {
  it("skips pipeline asserts when navigator.gpu unavailable", async (t) => {
    const adapter = await tryRequestAdapter();
    if (!adapter) {
      t.skip("no WebGPU adapter — live enforcement remains partial on CPU-only CI");
      return;
    }
    const device = await adapter.requestDevice();
    assert.ok(device);

    const pp = new PostProcessor(device, { width: 64, height: 64 });
    await pp.init();
    assert.ok(pp.pipelines.bloomCombine);

    const sm = new ShadowMapper(device, { size: 64 });
    await sm.init();
    assert.ok(sm.shadowPipeline);
    assert.ok(sm.shadowMap);

    const em = new EnvironmentMapper(device, { size: 32 });
    // Live init may be expensive; only assert resource helpers after partial setup
    em.generateDefaultEnvironment = async () => {};
    em.generateBRDFLUT = async () => {};
    await em.init();
    const res = em._createEnvResources();
    assert.ok(res.bindGroupLayout);
    assert.equal(res.prefilterMipCount, 5);

    device.destroy?.();
  });
});
