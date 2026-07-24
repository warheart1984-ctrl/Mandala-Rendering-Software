/**
 * Vulkan RHI — Phase C **declared** stub (Drive-G-1). Not production.
 * @implements {import("./RhiContract.js").Rhi}
 */
export class VulkanRhi {
  constructor(_options = {}) {
    this._backend = /** @type {const} */ ("vulkan");
  }
  getBackend() {
    return this._backend;
  }
  async getDevices() {
    throw new Error(
      'VulkanRhi.getDevices: roadmap / Phase C+; not implemented (use createRhi("webgpu") stub)'
    );
  }
  async selectDevice(_id = 0) {
    throw new Error("VulkanRhi.selectDevice: roadmap / Phase C+; not implemented");
  }
  async createBuffer() {
    throw new Error("VulkanRhi.createBuffer: roadmap / Phase C+; not implemented");
  }
  async createTexture() {
    throw new Error("VulkanRhi.createTexture: roadmap / Phase C+; not implemented");
  }
  async uploadBuffer() {
    throw new Error("VulkanRhi.uploadBuffer: roadmap / Phase C+; not implemented");
  }
  async readBuffer() {
    throw new Error("VulkanRhi.readBuffer: roadmap / Phase C+; not implemented");
  }
  async dispatchKernel() {
    throw new Error("VulkanRhi.dispatchKernel: roadmap / Phase C+; not implemented");
  }
}
