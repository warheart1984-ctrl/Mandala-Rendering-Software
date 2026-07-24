import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRhi } from "../../../rhi/RhiFactory.js";
import { selectWavefrontConfig } from "../../pipeline/WavefrontConfigSelector.js";
import { selectConformanceProfile } from "../../pipeline/ConformanceSelector.js";
import { renderWavefrontFrame } from "../../pipeline/WavefrontPipelineAdapter.js";
import { PathTracer4D } from "../../integrator/PathTracer4D.js";
import { createHyperCausticLens } from "../../scene/TestHyperCausticLens.js";

describe("RT4D Phase B wavefront / RHI stubs", () => {
  it("createRhi webgpu works; vulkan/dx12 throw roadmap errors", async () => {
    const rhi = createRhi("webgpu");
    assert.equal(rhi.getBackend(), "webgpu");
    const devices = await rhi.getDevices();
    assert.ok(devices.length >= 1);
    assert.throws(() => createRhi("vulkan"), /roadmap/i);
    assert.throws(() => createRhi("dx12"), /roadmap/i);
  });

  it("conformance defaults are record-optional (enforce false)", () => {
    const c = selectConformanceProfile();
    assert.equal(c.enforceCurvatureEvidence, false);
    assert.equal(c.enforceGpuEvidence, false);
    assert.equal(c.recordCurvatureEvidence, true);
  });

  it("selectWavefrontConfig maps quality and forces multiGpu off in Phase B", () => {
    const cfg = selectWavefrontConfig({
      quality: "high",
      host: "browser",
      multiGpuAvailable: true,
    });
    assert.equal(cfg.quality, "high");
    assert.equal(cfg.samplesPerPixel, 4);
    assert.equal(cfg.enableMultiGpu, false);
    assert.equal(cfg.enableDenoiser, true);
  });

  it("renderWavefrontFrame runs stub stages and records evidence", async () => {
    const result = await renderWavefrontFrame("world-stub", {
      quality: "baseline",
      host: "browser",
    });
    assert.ok(result.dispatchLog.length >= 4);
    const names = result.dispatchLog.map((d) => d.kernelName);
    assert.ok(names.some((n) => n.includes("generate")));
    assert.ok(names.some((n) => n.includes("accumulate")));
    assert.ok(result.evidence.length >= 1);
  });

  it("CPU PathTracer4D still traces Hyper-Caustic Lens (conformance oracle)", () => {
    const { scene, camera } = createHyperCausticLens({ width: 32, height: 24 });
    const tracer = new PathTracer4D({
      maxDepth: 2,
      samplesPerPixel: 1,
      rng: () => 0.5,
    });
    const ray = camera.generateRay(16, 12, 0.5, 0.5, 0.5, 0.5);
    const L = tracer.trace(ray, scene, 0);
    assert.ok(L);
    assert.equal(typeof L.x, "number");
  });
});
