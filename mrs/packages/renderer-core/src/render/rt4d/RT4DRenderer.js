import { PathTracer4D, SampleAccumulator } from "./integrator/PathTracer4D.js";
import { Projector4D } from "./output/projector.js";
import { vec4 } from "./math/vec4.js";
import { RT4DGPURenderer } from "./gpu/RT4DGPURenderer.js";
import { renderWavefrontFrame } from "./pipeline/WavefrontPipelineAdapter.js";
import { runLiveSceneEiGate } from "./pipeline/LiveSceneEiGate.js";
import { createHash } from "node:crypto";

function computeSceneHash(scene4D) {
  const meshCount = scene4D.meshes?.length ?? 0;
  const vertexCount = scene4D.meshes?.reduce((sum, m) => sum + (m.vertices?.length ?? 0), 0) ?? 0;
  const materialCount = scene4D.materials?.size ?? 0;
  const lightCount = scene4D.lights?.length ?? 0;
  return createHash("sha256").update(`${meshCount}|${vertexCount}|${materialCount}|${lightCount}`).digest("hex").slice(0, 16);
}

export async function renderRT4DFrame(scene4D, camera4D, options = {}) {
  if (options.engineMode === "wavefront") {
    return renderRT4DFrameWavefront(scene4D, camera4D, options);
  }

  const width = options.width ?? camera4D.width;
  const height = options.height ?? camera4D.height;
  const samples = options.samples ?? 64;
  const maxDepth = options.maxDepth ?? 8;
  const seed = options.seed ?? Date.now();

  // Log render intent for constitutional invariant checking
  const sceneHash = computeSceneHash(scene4D);
  console.debug(`[RenderDispatch] Render intent: sceneHash=${sceneHash}, seed=${seed}, width=${width}, height=${height}, samples=${samples}, maxDepth=${maxDepth}, camera=${JSON.stringify({width: camera4D.width, height: camera4D.height, fovX: camera4D.fovX, fovY: camera4D.fovY, fovZ: camera4D.fovZ, fovW: camera4D.fovW})}`);

  const eiGate = runLiveSceneEiGate(scene4D, options);

  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples });
  const accumulator = new SampleAccumulator(width, height);

  let rngState = seed;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = vec4(0, 0, 0, 0);
      for (let s = 0; s < samples; s++) {
        const u1 = fracSin(rngState++);
        const u2 = fracSin(rngState++);
        const u3 = fracSin(rngState++);
        const ray = camera4D.generateRay(x, y, u1, u2, u3);
        const L = tracer.trace(ray, scene4D);
        color.x += L.x; color.y += L.y; color.z += L.z;
      }
      const invS = 1 / samples;
      accumulator.addSample(x, y, vec4(color.x * invS, color.y * invS, color.z * invS, 1));
    }
  }

  accumulator.totalSamples = 1;
  const pixels = accumulator.finalize();
  const proj = new Projector4D({ width, height });
  const raster = proj.rasterize(pixels, width, height);

  return { pixels: raster, width, height, samples, eiGate };
}

function fracSin(s) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

let _gpuRenderer = null;

export async function renderRT4DFrameGPU(scene4D, camera4D, options = {}) {
  if (options.engineMode === "wavefront") {
    return renderRT4DFrameWavefront(scene4D, camera4D, options);
  }

  const eiGate = runLiveSceneEiGate(scene4D, options);

  if (!navigator?.gpu) {
    console.warn("WebGPU not available, falling back to CPU path tracer");
    const cpu = await renderRT4DFrame(scene4D, camera4D, {
      ...options,
      // Gate already ran; avoid double-evaluate / double-deny.
      runEiGate: false,
      enforceEngineInvariantTopology: false,
    });
    return { ...cpu, eiGate: eiGate ?? cpu.eiGate, gpu: false };
  }

  const width = options.width ?? camera4D.width;
  const height = options.height ?? camera4D.height;

  if (!_gpuRenderer) {
    _gpuRenderer = new RT4DGPURenderer({ width, height, maxDepth: options.maxDepth ?? 4, samplesPerPixel: options.samples ?? 16 });
    await _gpuRenderer.init();
  }

  _gpuRenderer.width = width;
  _gpuRenderer.height = height;
  _gpuRenderer.serializeScene(scene4D, camera4D);

  const result = await _gpuRenderer.render(scene4D, camera4D, {
    samples: options.samples ?? 16,
    maxDepth: options.maxDepth ?? 4,
    width,
    height,
  });

  const proj = new Projector4D({ width, height });
  const raster = proj.rasterize(result.pixels, width, height);

  return {
    pixels: raster,
    width,
    height,
    samples: options.samples ?? 16,
    gpu: true,
    eiGate,
  };
}

/**
 * Phase B wavefront route — stub-visible frame via RHI (not full path tracing).
 * Optional live-scene EI gate when `scene4D` is supplied and runEiGate/enforce is set.
 * @param {object} [scene4D]
 * @param {object} camera4D
 * @param {object} options
 */
export async function renderRT4DFrameWavefront(scene4D, camera4D, options = {}) {
  const width = options.width ?? camera4D?.width ?? 8;
  const height = options.height ?? camera4D?.height ?? 8;
  const quality =
    options.quality ??
    (options.samples >= 8 ? "ultra" : options.samples >= 4 ? "high" : "baseline");

  const result = await renderWavefrontFrame(options.worldId ?? "rt4d-wavefront", {
    quality,
    host: options.host ?? "browser",
    width,
    height,
    seed: options.seed ?? 0x4d5253,
    runConformance: options.runConformance !== false,
    allowLiveGpu: options.allowLiveGpu,
    forceStub: options.forceStub,
    gpuDevice: options.gpuDevice,
    cssvPath: options.cssvPath,
    onEvidence: options.onEvidence,
    scene4D,
    camera4D: camera4D,
    runEiGate: options.runEiGate,
    enforceEngineInvariantTopology: options.enforceEngineInvariantTopology,
    checkMissImplication: options.checkMissImplication,
    topologyRays: options.topologyRays,
  });

  return {
    pixels: result.pixels,
    width: result.width,
    height: result.height,
    samples: result.config.samplesPerPixel,
    gpu: result.rhiMode === "live",
    rhiMode: result.rhiMode,
    engineMode: "wavefront",
    evidence: result.evidence,
    conformance: result.conformance,
    dispatchLog: result.dispatchLog,
    eiGate: result.eiGate ?? null,
  };
}
