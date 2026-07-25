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
  it("createRhi webgpu works; vulkan/dx12 construct but methods throw roadmap", async () => {
    const rhi = createRhi("webgpu", { allowLiveGpu: false });
    assert.equal(rhi.getBackend(), "webgpu");
    const devices = await rhi.getDevices();
    assert.ok(devices.length >= 1);
    // Phase C: constructors are declared; methods throw roadmap errors.
    const vulkan = createRhi("vulkan");
    const dx12 = createRhi("dx12");
    assert.equal(vulkan.getBackend(), "vulkan");
    assert.equal(dx12.getBackend(), "dx12");
    await assert.rejects(() => vulkan.getDevices(), /roadmap/i);
    await assert.rejects(() => dx12.getDevices(), /roadmap/i);
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

/**
 * Mock GPUDevice for real wavefront path (Node has no WebGPU).
 * Tracks pipeline creation, bind groups, and encoder ops.
 */
function createMockGpuDevice() {
  if (typeof globalThis.GPUBufferUsage === "undefined") {
    globalThis.GPUBufferUsage = {
      MAP_READ: 1,
      MAP_WRITE: 2,
      COPY_SRC: 4,
      COPY_DST: 8,
      INDEX: 16,
      VERTEX: 32,
      UNIFORM: 64,
      STORAGE: 128,
    };
  }
  if (typeof globalThis.GPUMapMode === "undefined") {
    globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
  }
  if (typeof globalThis.GPUShaderStage === "undefined") {
    globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  }

  /** @param {number} size */
  function makeBuf(size) {
    const data = new Uint8Array(size);
    return {
      size,
      usage: 0,
      _data: data,
      destroy() {},
      async mapAsync() {
        this._mapped = data;
      },
      getMappedRange() {
        // Must return the live buffer (not a copy) so mappedAtCreation writes stick.
        return this._mapped.buffer;
      },
      unmap() {
        this._mapped = null;
      },
    };
  }

  const stats = {
    shaderModules: 0,
    computePipelines: 0,
    bindGroupLayouts: [],
    bindGroups: [],
    encoderOps: [],
    submits: 0,
  };

  const mockDevice = {
    stats,
    createBuffer({ size, mappedAtCreation }) {
      const buf = makeBuf(size);
      if (mappedAtCreation) buf._mapped = buf._data;
      return buf;
    },
    createBindGroupLayout(desc) {
      stats.bindGroupLayouts.push(desc);
      return { entries: desc.entries };
    },
    createBindGroup(desc) {
      stats.bindGroups.push({
        bindingCount: desc.entries.length,
        bindings: desc.entries.map((e) => e.binding),
      });
      return {};
    },
    createShaderModule() {
      stats.shaderModules += 1;
      return {};
    },
    createPipelineLayout() {
      return {};
    },
    createComputePipeline() {
      stats.computePipelines += 1;
      return {};
    },
    queue: {
      writeBuffer(buf, offset, src) {
        const bytes =
          src instanceof ArrayBuffer
            ? new Uint8Array(src)
            : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
        buf._data.set(bytes, offset);
      },
      submit(cmds) {
        stats.submits += 1;
        for (const cmd of cmds) {
          if (typeof cmd._apply === "function") cmd._apply();
        }
      },
      async onSubmittedWorkDone() {},
    },
    createCommandEncoder() {
      /** @type {Array<() => void>} */
      const ops = [];
      /** @type {string[]} */
      const opLog = [];
      return {
        copyBufferToBuffer(src, srcOffset, dst, dstOffset, size) {
          opLog.push("copy");
          ops.push(() => {
            dst._data.set(src._data.subarray(srcOffset, srcOffset + size), dstOffset);
          });
        },
        beginComputePass() {
          opLog.push("compute");
          return {
            setPipeline() {},
            setBindGroup() {},
            dispatchWorkgroups() {},
            end() {},
          };
        },
        finish() {
          stats.encoderOps.push([...opLog]);
          return {
            _apply() {
              for (const op of ops) op();
            },
          };
        },
      };
    },
  };

  return mockDevice;
}

describe("RT4D real wavefront kernels (mock GPUDevice)", () => {
  it("RealWavefrontKernels creates 4 compute pipelines from production WGSL", async () => {
    const { RealWavefrontKernels } = await import("./WavefrontKernels.js");
    const { createRt4dWavefrontPipeline } = await import("./WavefrontPipeline.js");
    const device = createMockGpuDevice();
    const pipeline = await createRt4dWavefrontPipeline({
      gpuDevice: device,
      width: 4,
      height: 4,
      scene: { primitives: [], lights: [], materials: { listIds: () => [], get: () => ({ params: {} }) } },
      camera: { position: { x: 0, y: 0, z: -3, w: 0 }, width: 4, height: 4 },
    });
    assert.equal(pipeline.mode, "live");
    assert.ok(pipeline.kernels instanceof RealWavefrontKernels);
    assert.equal(device.stats.computePipelines, 4);
    assert.equal(device.stats.shaderModules, 4);
  });

  it("batched scheduler: generate → (extend→shade→copy)×maxDepth → accumulate in one encoder", async () => {
    const { createRt4dWavefrontPipeline } = await import("./WavefrontPipeline.js");
    const device = createMockGpuDevice();
    const maxDepth = 3;
    const pipeline = await createRt4dWavefrontPipeline({
      gpuDevice: device,
      width: 4,
      height: 4,
      maxDepth,
      samplesPerPixel: 1,
      scene: { primitives: [], lights: [], materials: { listIds: () => [], get: () => ({ params: {} }) } },
      camera: { position: { x: 0, y: 0, z: -3, w: 0 }, width: 4, height: 4 },
    });

    await pipeline.renderFrame("mock-world", {
      maxDepth,
      samplesPerPixel: 1,
      tileSize: 32,
      quality: "baseline",
      enableDenoiser: false,
      enableCurvatureEvidence: false,
      enableMultiGpu: false,
    });

    assert.equal(device.stats.submits, 1, "one submit per sample");
    assert.equal(device.stats.encoderOps.length, 1, "one encoder finish");

    const names = pipeline.dispatchLog.map((d) => d.kernelName);
    assert.equal(names[0], "rt4d_wavefront_generate");
    const extendCount = names.filter((n) => n === "rt4d_wavefront_extend").length;
    const shadeCount = names.filter((n) => n === "rt4d_wavefront_shade").length;
    const copyCount = names.filter((n) => n === "rt4d_wavefront_copy_scatter").length;
    assert.equal(extendCount, maxDepth);
    assert.equal(shadeCount, maxDepth);
    assert.equal(copyCount, maxDepth);
    assert.ok(names.includes("rt4d_wavefront_accumulate"));

    // Per bounce: extend compute + shade compute + 2 copies; plus generate + accum(copy+compute)
    const ops = device.stats.encoderOps[0];
    const computePasses = ops.filter((o) => o === "compute").length;
    // generate + maxDepth*(extend+shade) + accumulate = 1 + 2*maxDepth + 1
    assert.equal(computePasses, 1 + 2 * maxDepth + 1);
  });

  it("bind groups match raygen/bvh/shade/accum layout sizes", async () => {
    const { createRt4dWavefrontPipeline } = await import("./WavefrontPipeline.js");
    const device = createMockGpuDevice();
    const pipeline = await createRt4dWavefrontPipeline({
      gpuDevice: device,
      width: 2,
      height: 2,
      maxDepth: 1,
      samplesPerPixel: 1,
      scene: { primitives: [], lights: [], materials: { listIds: () => [], get: () => ({ params: {} }) } },
      camera: { position: { x: 0, y: 0, z: -3, w: 0 }, width: 2, height: 2 },
    });
    await pipeline.renderFrame("bg", {
      maxDepth: 1,
      samplesPerPixel: 1,
      tileSize: 32,
      quality: "baseline",
      enableDenoiser: false,
      enableCurvatureEvidence: false,
      enableMultiGpu: false,
    });

    const counts = device.stats.bindGroups.map((g) => g.bindingCount);
    // raygen=5, bvh=11, shade=9, accum=3 (plus any from layout creation path)
    assert.ok(counts.includes(5), `raygen layout 5 bindings, got ${counts}`);
    assert.ok(counts.includes(11), `bvh layout 11 bindings, got ${counts}`);
    assert.ok(counts.includes(9), `shade layout 9 bindings, got ${counts}`);
    assert.ok(counts.includes(3), `accum layout 3 bindings, got ${counts}`);
  });

  it("dual call signatures + forceStub keeps Phase B path", async () => {
    const { createRt4dWavefrontPipeline } = await import("./WavefrontPipeline.js");
    const { StubWavefrontKernels } = await import("./WavefrontKernels.js");

    const device = createMockGpuDevice();
    const real = await createRt4dWavefrontPipeline({
      backend: "webgpu",
      gpuDevice: device,
      width: 2,
      height: 2,
    });
    assert.equal(real.mode, "live");

    const stub = await createRt4dWavefrontPipeline("webgpu", {
      forceStub: true,
      gpuDevice: device,
      allowLiveGpu: false,
      width: 2,
      height: 2,
    });
    assert.ok(stub.kernels instanceof StubWavefrontKernels);
    assert.equal(stub.kernels.isBatched, false);
    assert.equal(stub.mode, "stub");
  });

  it("renderWavefrontFrame with gpuDevice returns live rhiMode + dispatchLog", async () => {
    const device = createMockGpuDevice();
    const { scene, camera } = createHyperCausticLens({ width: 4, height: 4 });
    const result = await renderWavefrontFrame("live-mock", {
      quality: "baseline",
      host: "browser",
      width: 4,
      height: 4,
      maxDepth: 2,
      gpuDevice: device,
      scene4D: scene,
      camera4D: camera,
      runConformance: false,
    });
    assert.equal(result.rhiMode, "live");
    assert.ok(result.dispatchLog.length >= 1 + 2 * 2 + 1);
    assert.ok(result.dispatchLog.some((d) => d.kernelName.includes("generate")));
    assert.ok(result.dispatchLog.some((d) => d.kernelName.includes("copy_scatter")));
  });

  it("WavefrontDenoiser is a no-op (applied: false)", async () => {
    const { WavefrontDenoiser } = await import("./WavefrontDenoiser.js");
    const d = new WavefrontDenoiser();
    const out = await d.run({}, { strength: 0.5 });
    assert.equal(out.applied, false);
    assert.equal(out.stub, true);
  });

  it("renderRT4DFrameWavefront passes scene + camera into real path", async () => {
    const device = createMockGpuDevice();
    const { scene, camera } = createHyperCausticLens({ width: 4, height: 4 });
    const frame = await renderRT4DFrameWavefront(scene, camera, {
      width: 4,
      height: 4,
      maxDepth: 2,
      gpuDevice: device,
      runConformance: false,
    });
    assert.equal(frame.engineMode, "wavefront");
    assert.equal(frame.rhiMode, "live");
    assert.equal(frame.gpu, true);
    assert.ok(frame.dispatchLog.some((d) => d.shader === "RAYGEN_WGSL" || d.kernelName.includes("generate")));
  });
});
