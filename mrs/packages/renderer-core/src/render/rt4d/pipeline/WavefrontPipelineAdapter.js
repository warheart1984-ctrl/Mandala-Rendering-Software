import { selectWavefrontConfig } from "./WavefrontConfigSelector.js";
import { createRt4dWavefrontPipeline } from "../gpu/wavefront/WavefrontPipeline.js";
import { prepareWorld } from "../WorldOrchestrator.js";
import { runCPUConformanceGate } from "./CPUConformanceGate.js";
import { createWavefrontCssvWriter } from "./WavefrontCssvWriter.js";
import { runLiveSceneEiGate } from "./LiveSceneEiGate.js";

/**
 * Host-facing adapter beside RT4DGPURenderer.
 *
 * Browser / Node call:
 *   import { renderWavefrontFrame } from "@mrs/renderer-core/rt4d";
 *   const frame = await renderWavefrontFrame("world-id", { quality: "baseline", host: "browser" });
 *
 * Dual path:
 *   - Stub RHI (default in Node CI) — Phase B conformance / plumbing
 *   - Real WebGPU when `gpuDevice` or scene+camera+navigator.gpu — partial (mock-tested)
 *
 * Optional live-scene EI gate when `opts.scene4D` + `runEiGate` / enforce flags.
 *
 * @param {string} worldId
 * @param {object} opts
 * @param {"baseline"|"high"|"ultra"} [opts.quality]
 * @param {"browser"|"unity"|"unreal"|"native"} [opts.host]
 * @param {boolean} [opts.multiGpuAvailable]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.seed]
 * @param {number} [opts.maxDepth]
 * @param {number} [opts.samplesPerPixel]
 * @param {boolean} [opts.runConformance] — default true; logs only
 * @param {string} [opts.cssvPath] — optional Node JSONL path
 * @param {object} [opts.worldDoc]
 * @param {object} [opts.worldContext]
 * @param {object} [opts.scene4D] — optional Scene4D for EI gate + real GPU path
 * @param {object} [opts.camera4D] — optional camera for real GPU path
 * @param {object} [opts.scene]
 * @param {object} [opts.camera]
 * @param {GPUDevice} [opts.gpuDevice] — mock or live device → real kernels
 * @param {boolean} [opts.forceStub]
 * @param {boolean} [opts.runEiGate]
 * @param {boolean} [opts.enforceEngineInvariantTopology]
 * @param {boolean} [opts.stepWave=true]
 * @param {(rec: object) => Promise<void>|void} [opts.onEvidence]
 * @param {boolean} [opts.allowLiveGpu]
 */
export async function renderWavefrontFrame(worldId, opts = {}) {
  const width = opts.width ?? 8;
  const height = opts.height ?? 8;
  const seed = opts.seed ?? 0x4d5253;
  const scene = opts.scene4D ?? opts.scene ?? null;
  const camera = opts.camera4D ?? opts.camera ?? null;

  const eiGate = runLiveSceneEiGate(scene, opts);

  let worldContext = opts.worldContext ?? null;
  if (!worldContext && opts.worldDoc) {
    worldContext = prepareWorld(opts.worldDoc);
  }
  if (worldContext?.waveField && opts.stepWave !== false) {
    worldContext.waveField.step();
  }

  const config = selectWavefrontConfig({
    quality: opts.quality,
    host: opts.host,
    multiGpuAvailable: opts.multiGpuAvailable === true,
  });
  if (opts.maxDepth != null) config.maxDepth = opts.maxDepth;
  if (opts.samplesPerPixel != null) config.samplesPerPixel = opts.samplesPerPixel;

  const cssv = opts.cssvPath ? createWavefrontCssvWriter({ filePath: opts.cssvPath }) : null;
  const onEvidence = async (rec) => {
    if (cssv) await cssv.write(rec);
    if (opts.onEvidence) await opts.onEvidence(rec);
  };

  const pipeline = await createRt4dWavefrontPipeline("webgpu", {
    onEvidence,
    width,
    height,
    seed,
    allowLiveGpu: opts.allowLiveGpu,
    forceStub: opts.forceStub,
    gpuDevice: opts.gpuDevice,
    scene,
    camera,
    maxDepth: config.maxDepth,
    samplesPerPixel: config.samplesPerPixel,
  });

  await pipeline.renderFrame(worldId, config);
  const pixels = await pipeline.getPixels();

  let conformance = null;
  if (opts.runConformance !== false) {
    conformance = runCPUConformanceGate(pixels, { width, height, seed, log: true });
    if (cssv && pipeline.evidence.records.length > 0) {
      const last = pipeline.evidence.records[pipeline.evidence.records.length - 1];
      last.conformance = {
        passed: conformance.passed,
        candidateHash: conformance.candidateHash,
        referenceHash: conformance.referenceHash,
      };
    }
  }

  const dispatchLog = pipeline.dispatchLog ?? pipeline.rhi?.dispatchLog ?? [];
  const rhiMode = pipeline.mode ?? pipeline.rhi?.mode ?? "stub";

  return {
    worldId,
    config,
    width,
    height,
    pixels,
    evidence: pipeline.evidence.records,
    dispatchLog,
    worldContext,
    rhiMode,
    conformance,
    eiGate,
    engineMode: "wavefront",
  };
}
