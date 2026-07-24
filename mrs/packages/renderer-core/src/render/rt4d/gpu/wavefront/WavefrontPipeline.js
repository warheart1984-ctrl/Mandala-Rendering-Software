import { createRhi } from "../../../rhi/RhiFactory.js";
import { GpuWavefrontQueue } from "./WavefrontQueue.js";
import { StubWavefrontKernels } from "./WavefrontKernels.js";
import { DefaultWavefrontScheduler } from "./WavefrontScheduler.js";
import { WavefrontDenoiserStub } from "./WavefrontDenoiser.js";
import { WavefrontEvidence } from "./WavefrontEvidence.js";

/**
 * @typedef {object} WavefrontKernelContext
 * @property {import("../../../rhi/RhiContract.js").Rhi} rhi
 * @property {import("../../../rhi/RhiTypes.js").RhiDeviceInfo} device
 * @property {import("../../../rhi/RhiTypes.js").RhiTextureHandle} frameTexture
 * @property {import("../../../rhi/RhiTypes.js").RhiBufferHandle} pathBuffer
 * @property {import("../../../rhi/RhiTypes.js").RhiBufferHandle} worldBuffer
 */

/**
 * @param {import("../../../rhi/RhiTypes.js").RhiBackend} [backend]
 * @param {object} [options]
 */
export async function createRt4dWavefrontPipeline(backend = "webgpu", options = {}) {
  const rhi = createRhi(backend);
  const device = await rhi.selectDevice();
  const frameTexture = await rhi.createTexture(
    options.width ?? 8,
    options.height ?? 8,
    "rgba8"
  );
  const pathBuffer = await rhi.createBuffer(1024, "storage");
  const worldBuffer = await rhi.createBuffer(1024, "storage");

  const queue = new GpuWavefrontQueue();
  const kernels = new StubWavefrontKernels(rhi);
  const evidence = new WavefrontEvidence({ write: options.onEvidence });
  const denoiser = new WavefrontDenoiserStub();

  const makeContext = () => ({
    rhi,
    device,
    frameTexture,
    pathBuffer,
    worldBuffer,
  });

  const scheduler = new DefaultWavefrontScheduler({
    kernels,
    evidence,
    denoiser,
    makeContext,
  });

  return {
    rhi,
    queue,
    evidence,
    /**
     * @param {string} _worldId
     * @param {import("./WavefrontConfig.js").WavefrontConfig} config
     */
    async renderFrame(_worldId, config) {
      if (config.enableMultiGpu) {
        // Multi-GPU is RT4D v4 — ignore flag in Phase B with evidence note
        evidence.records.push({
          note: "enableMultiGpu ignored in Phase B (deferred to RT4D v4)",
        });
      }
      queue.clear();
      await scheduler.runFrame(config);
    },
  };
}
