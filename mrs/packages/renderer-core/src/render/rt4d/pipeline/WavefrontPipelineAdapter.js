import { selectWavefrontConfig } from "./WavefrontConfigSelector.js";
import { createRt4dWavefrontPipeline } from "../gpu/wavefront/WavefrontPipeline.js";

/**
 * Host-facing adapter beside RT4DGPURenderer (Phase B stub path).
 *
 * @param {string} worldId
 * @param {object} opts
 * @param {"baseline"|"high"|"ultra"} opts.quality
 * @param {"browser"|"unity"|"unreal"|"native"} opts.host
 * @param {boolean} [opts.multiGpuAvailable]
 * @param {(rec: object) => Promise<void>|void} [opts.onEvidence]
 */
export async function renderWavefrontFrame(worldId, opts) {
  const config = selectWavefrontConfig({
    quality: opts.quality,
    host: opts.host,
    multiGpuAvailable: opts.multiGpuAvailable === true,
  });
  const pipeline = await createRt4dWavefrontPipeline("webgpu", {
    onEvidence: opts.onEvidence,
  });
  await pipeline.renderFrame(worldId, config);
  return {
    worldId,
    config,
    evidence: pipeline.evidence.records,
    dispatchLog: pipeline.rhi.dispatchLog ?? [],
  };
}
