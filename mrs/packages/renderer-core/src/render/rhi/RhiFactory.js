import { WebGpuRhi } from "./webgpu/WebGpuRhi.js";

/**
 * @param {import("./RhiTypes.js").RhiBackend} backend
 * @returns {import("./RhiContract.js").Rhi}
 */
export function createRhi(backend) {
  switch (backend) {
    case "webgpu":
      return new WebGpuRhi();
    case "vulkan":
    case "dx12":
      throw new Error(
        `RHI backend "${backend}" is roadmap (RT4D v4 / Phase C+); use createRhi("webgpu") for Phase B`
      );
    default:
      throw new Error(`Unknown RHI backend: ${backend}`);
  }
}

export { WebGpuRhi } from "./webgpu/WebGpuRhi.js";
export { RHI_BACKENDS } from "./RhiTypes.js";
