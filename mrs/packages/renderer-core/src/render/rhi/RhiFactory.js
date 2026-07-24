import { WebGpuRhi } from "./webgpu/WebGpuRhi.js";
import { VulkanRhi } from "./VulkanRhi.js";
import { Dx12Rhi } from "./Dx12Rhi.js";

/**
 * - webgpu: live navigator.gpu when available, else stub (options.allowLiveGpu)
 * - vulkan/dx12: Phase C declared constructors; methods throw (not production)
 *
 * @param {import("./RhiTypes.js").RhiBackend} backend
 * @param {object} [options] forwarded to WebGpuRhi / native stubs
 * @returns {import("./RhiContract.js").Rhi}
 */
export function createRhi(backend, options = {}) {
  switch (backend) {
    case "webgpu":
      return new WebGpuRhi(options);
    case "vulkan":
      return new VulkanRhi(options);
    case "dx12":
      return new Dx12Rhi(options);
    default:
      throw new Error(`Unknown RHI backend: ${backend}`);
  }
}

export { WebGpuRhi } from "./webgpu/WebGpuRhi.js";
export { VulkanRhi } from "./VulkanRhi.js";
export { Dx12Rhi } from "./Dx12Rhi.js";
export { MultiGpuArbitrator } from "./MultiGpuArbitrator.js";
export { RHI_BACKENDS } from "./RhiTypes.js";
