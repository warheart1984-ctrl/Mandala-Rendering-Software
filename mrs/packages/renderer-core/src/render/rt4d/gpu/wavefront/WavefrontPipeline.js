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
  const width = options.width ?? 8;
  const height = options.height ?? 8;
  const seed = options.seed ?? 0x4d5253;

  const rhi =
    options.rhi ??
    createRhi(backend, {
      allowLiveGpu: options.allowLiveGpu,
      frameWidth: width,
      frameHeight: height,
      seed,
      gpuDevice: options.gpuDevice,
    });

  const device = await rhi.selectDevice();
  const frameTexture = await rhi.createTexture(width, height, "rgba8");
  const pathBuffer = await rhi.createBuffer(Math.max(1024, width * height * 4), "storage");
  const worldBuffer = await rhi.createBuffer(1024, "storage");

  const queue = new GpuWavefrontQueue();
  const kernels = new StubWavefrontKernels(rhi, { width, height });
  const evidence = new WavefrontEvidence({ write: options.onEvidence, seed });
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
    width,
    height,
    /**
     * @param {string} _worldId
     * @param {import("./WavefrontConfig.js").WavefrontConfig} config
     */
    async renderFrame(_worldId, config) {
      if (config.enableMultiGpu) {
        evidence.records.push({
          note: "enableMultiGpu ignored in Phase B (deferred to RT4D v4)",
        });
      }
      queue.clear();
      // Seed a tiny generate queue so stage plumbing is observable
      queue.enqueueGenerate([
        {
          id: 0,
          pixelX: 0,
          pixelY: 0,
          dimension4: 0,
          depth: 0,
          throughput: [1, 1, 1, 1],
          terminated: false,
        },
      ]);
      await scheduler.runFrame(config);
      if (typeof rhi.ensureFrameReadback === "function") {
        await rhi.ensureFrameReadback();
      }
    },
    /** @returns {Promise<Uint8ClampedArray>} */
    async getPixels() {
      if (typeof rhi.getFramePixels === "function") {
        return rhi.getFramePixels();
      }
      return new Uint8ClampedArray(width * height * 4);
    },
  };
}
