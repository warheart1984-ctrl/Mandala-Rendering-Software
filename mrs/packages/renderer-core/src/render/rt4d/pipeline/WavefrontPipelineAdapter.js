import { selectWavefrontConfig } from "./WavefrontConfigSelector.js";
import { createRt4dWavefrontPipeline } from "../gpu/wavefront/WavefrontPipeline.js";
import { runCPUConformanceGate } from "./CPUConformanceGate.js";
import { createWavefrontCssvWriter } from "./WavefrontCssvWriter.js";

/**
 * Host-facing adapter beside RT4DGPURenderer (Phase B path).
 *
 * Browser / Node call:
 *   import { renderWavefrontFrame } from "@mrs/renderer-core/rt4d";
 *   const frame = await renderWavefrontFrame("world-id", { quality: "baseline", host: "browser" });
 *
 * @param {string} worldId
 * @param {object} opts
 * @param {"baseline"|"high"|"ultra"} opts.quality
 * @param {"browser"|"unity"|"unreal"|"native"} opts.host
 * @param {boolean} [opts.multiGpuAvailable]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.seed]
 * @param {boolean} [opts.runConformance] — default true; logs only
 * @param {string} [opts.cssvPath] — optional Node JSONL path
 * @param {(rec: object) => Promise<void>|void} [opts.onEvidence]
 * @param {boolean} [opts.allowLiveGpu]
 */
export async function renderWavefrontFrame(worldId, opts) {
  const width = opts.width ?? 8;
  const height = opts.height ?? 8;
  const seed = opts.seed ?? 0x4d5253;

  const config = selectWavefrontConfig({
    quality: opts.quality,
    host: opts.host,
    multiGpuAvailable: opts.multiGpuAvailable === true,
  });

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
  });

  await pipeline.renderFrame(worldId, config);
  const pixels = pipeline.getPixels();

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

  return {
    worldId,
    config,
    width,
    height,
    pixels,
    evidence: pipeline.evidence.records,
    dispatchLog: pipeline.rhi.dispatchLog ?? [],
    rhiMode: pipeline.rhi.mode ?? "stub",
    conformance,
    engineMode: "wavefront",
  };
}
