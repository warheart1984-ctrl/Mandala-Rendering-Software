import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRhi } from "../../../rhi/RhiFactory.js";
import { WebGpuRhi } from "../../../rhi/webgpu/WebGpuRhi.js";
import { selectWavefrontConfig } from "../../pipeline/WavefrontConfigSelector.js";
import { selectConformanceProfile } from "../../pipeline/ConformanceSelector.js";
import { renderWavefrontFrame } from "../../pipeline/WavefrontPipelineAdapter.js";
import {
  runCPUConformanceGate,
  buildTinyReferenceFrame,
  hashBytes,
} from "../../pipeline/CPUConformanceGate.js";
import { DefaultWavefrontScheduler } from "./WavefrontScheduler.js";
import { StubWavefrontKernels } from "./WavefrontKernels.js";
import { WavefrontEvidence } from "./WavefrontEvidence.js";
import { PathTracer4D } from "../../integrator/PathTracer4D.js";
import { createHyperCausticLens } from "../../scene/TestHyperCausticLens.js";
import { renderRT4DFrame, renderRT4DFrameWavefront } from "../../RT4DRenderer.js";
import { GENERATE_WGSL, EXTEND_WGSL, SHADE_WGSL, ACCUMULATE_WGSL } from "./kernels/index.js";

describe("RT4D Phase B wavefront / RHI", () => {
  it("createRhi webgpu works; vulkan/dx12 throw roadmap errors", async () => {
    const rhi = createRhi("webgpu", { allowLiveGpu: false });
    assert.equal(rhi.getBackend(), "webgpu");
    const devices = await rhi.getDevices();
    assert.ok(devices.length >= 1);
    assert.throws(() => createRhi("vulkan"), /roadmap/i);
    assert.throws(() => createRhi("dx12"), /roadmap/i);
  });

  it("WebGpuRhi createBuffer/uploadBuffer/readBuffer round-trip (stub)", async () => {
    const rhi = new WebGpuRhi({ allowLiveGpu: false });
    await rhi.selectDevice();
    const buf = await rhi.createBuffer(16, "storage");
    const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await rhi.uploadBuffer(buf, src);
    const dst = new Uint8Array(8);
    await rhi.readBuffer(buf, dst);
    assert.deepEqual([...dst], [...src]);
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

  it("scheduler stage order is generate→extend→shade→accumulate", async () => {
    const rhi = createRhi("webgpu", { allowLiveGpu: false, frameWidth: 4, frameHeight: 4 });
    await rhi.selectDevice();
    const frameTexture = await rhi.createTexture(4, 4, "rgba8");
    const pathBuffer = await rhi.createBuffer(64, "storage");
    const worldBuffer = await rhi.createBuffer(64, "storage");
    const kernels = new StubWavefrontKernels(rhi, { width: 4, height: 4 });
    const evidence = new WavefrontEvidence({ seed: 1 });
    const order = [];
    const orig = {
      g: kernels.launchGenerate.bind(kernels),
      e: kernels.launchExtend.bind(kernels),
      s: kernels.launchShade.bind(kernels),
      a: kernels.launchAccumulate.bind(kernels),
    };
    kernels.launchGenerate = async (ctx) => {
      order.push("generate");
      return orig.g(ctx);
    };
    kernels.launchExtend = async (ctx) => {
      order.push("extend");
      return orig.e(ctx);
    };
    kernels.launchShade = async (ctx) => {
      order.push("shade");
      return orig.s(ctx);
    };
    kernels.launchAccumulate = async (ctx) => {
      order.push("accumulate");
      return orig.a(ctx);
    };

    const scheduler = new DefaultWavefrontScheduler({
      kernels,
      evidence,
      makeContext: () => ({
        rhi,
        device: { id: 0, name: "stub", backend: "webgpu", supportsRayTracing: false, supportsMultiGpu: false },
        frameTexture,
        pathBuffer,
        worldBuffer,
      }),
    });

    await scheduler.runFrame({
      maxDepth: 4,
      samplesPerPixel: 1,
      tileSize: 32,
      quality: "baseline",
      enableDenoiser: false,
      enableCurvatureEvidence: true,
      enableMultiGpu: false,
    });

    assert.deepEqual(order, ["generate", "extend", "shade", "accumulate"]);
  });

  it("renderWavefrontFrame runs stages, produces pixels, conformance gate returns result", async () => {
    const result = await renderWavefrontFrame("world-stub", {
      quality: "baseline",
      host: "browser",
      width: 8,
      height: 8,
      seed: 0x4d5253,
      allowLiveGpu: false,
      runConformance: true,
    });
    assert.ok(result.dispatchLog.length >= 4);
    const names = result.dispatchLog.map((d) => d.kernelName);
    assert.ok(names.some((n) => n.includes("generate")));
    assert.ok(names.some((n) => n.includes("accumulate")));
    assert.ok(result.evidence.length >= 1);
    assert.equal(result.pixels.length, 8 * 8 * 4);
    assert.ok(result.conformance);
    assert.equal(typeof result.conformance.passed, "boolean");
    assert.equal(result.conformance.passed, true);
    assert.equal(result.config.enableMultiGpu, false);
  });

  it("CPUConformanceGate compares hashes and logs without throwing", () => {
    const ref = buildTinyReferenceFrame(4, 4, 7);
    const ok = runCPUConformanceGate(ref, { width: 4, height: 4, seed: 7, log: false });
    assert.equal(ok.passed, true);
    const bad = new Uint8ClampedArray(ref);
    bad[0] = (bad[0] + 1) & 0xff;
    const fail = runCPUConformanceGate(bad, { width: 4, height: 4, seed: 7, log: false });
    assert.equal(fail.passed, false);
    assert.notEqual(hashBytes(ref), hashBytes(bad));
  });

  it("engineMode wavefront routes from renderRT4DFrame", async () => {
    const frame = await renderRT4DFrame({}, { width: 4, height: 4 }, {
      engineMode: "wavefront",
      width: 4,
      height: 4,
      quality: "baseline",
      allowLiveGpu: false,
      runConformance: true,
    });
    assert.equal(frame.engineMode, "wavefront");
    assert.equal(frame.pixels.length, 4 * 4 * 4);
  });

  it("renderRT4DFrameWavefront is exported and returns frame", async () => {
    const frame = await renderRT4DFrameWavefront({}, { width: 4, height: 4 }, {
      quality: "baseline",
      allowLiveGpu: false,
    });
    assert.equal(frame.engineMode, "wavefront");
  });

  it("WGSL kernel files load in Node", () => {
    assert.ok(GENERATE_WGSL && GENERATE_WGSL.includes("@compute"));
    assert.ok(EXTEND_WGSL && EXTEND_WGSL.includes("extend") || EXTEND_WGSL.includes("@compute"));
    assert.ok(SHADE_WGSL && SHADE_WGSL.includes("@compute"));
    assert.ok(ACCUMULATE_WGSL && ACCUMULATE_WGSL.includes("@compute"));
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
