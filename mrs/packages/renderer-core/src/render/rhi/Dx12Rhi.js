/**
 * DirectX 12 RHI — Phase C **declared** stub (Drive-G-1). Not production.
 * @implements {import("./RhiContract.js").Rhi}
 */
export class Dx12Rhi {
  constructor(_options = {}) {
    this._backend = /** @type {const} */ ("dx12");
  }
  getBackend() {
    return this._backend;
  }
  async getDevices() {
    throw new Error(
      'Dx12Rhi.getDevices: roadmap / Phase C+; not implemented (use createRhi("webgpu") stub)'
    );
  }
  async selectDevice(_id = 0) {
    throw new Error("Dx12Rhi.selectDevice: roadmap / Phase C+; not implemented");
  }
  async createBuffer() {
    throw new Error("Dx12Rhi.createBuffer: roadmap / Phase C+; not implemented");
  }
  async createTexture() {
    throw new Error("Dx12Rhi.createTexture: roadmap / Phase C+; not implemented");
  }
  async uploadBuffer() {
    throw new Error("Dx12Rhi.uploadBuffer: roadmap / Phase C+; not implemented");
  }
  async readBuffer() {
    throw new Error("Dx12Rhi.readBuffer: roadmap / Phase C+; not implemented");
  }
  async dispatchKernel() {
    throw new Error("Dx12Rhi.dispatchKernel: roadmap / Phase C+; not implemented");
  }
}
