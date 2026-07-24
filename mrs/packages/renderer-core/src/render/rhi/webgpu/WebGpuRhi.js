/**
 * WebGPU RHI stub (Phase B).
 * Enumerates a synthetic device; dispatchKernel records calls without GPU execution
 * unless a real navigator.gpu device is injected later.
 *
 * @implements {import("./RhiContract.js").Rhi}
 */
export class WebGpuRhi {
  constructor(options = {}) {
    this._nextId = 1;
    /** @type {import("./RhiTypes.js").RhiDeviceInfo|null} */
    this._device = null;
    /** @type {Array<{kernelName: string, x: number, y: number, z: number}>} */
    this.dispatchLog = [];
    this._allowLiveGpu = options.allowLiveGpu === true;
  }

  getBackend() {
    return /** @type {const} */ ("webgpu");
  }

  async getDevices() {
    return [
      {
        id: 0,
        name: "WebGPU (stub)",
        backend: /** @type {const} */ ("webgpu"),
        supportsRayTracing: false,
        supportsMultiGpu: false,
      },
    ];
  }

  async selectDevice(deviceId = 0) {
    const devices = await this.getDevices();
    const found = devices.find((d) => d.id === deviceId) ?? devices[0];
    this._device = found;
    return found;
  }

  async createBuffer(size, _usage) {
    return { id: this._nextId++, size };
  }

  async createTexture(width, height, format) {
    return { id: this._nextId++, width, height, format };
  }

  async uploadBuffer(_handle, _data) {
    /* stub */
  }

  async readBuffer(_handle, target) {
    if (target && typeof target.fill === "function") {
      target.fill(0);
    }
  }

  async dispatchKernel(kernelName, workgroupsX, workgroupsY, workgroupsZ, _bindings) {
    this.dispatchLog.push({
      kernelName,
      x: workgroupsX,
      y: workgroupsY,
      z: workgroupsZ,
    });
    if (this._allowLiveGpu && typeof navigator !== "undefined" && navigator.gpu) {
      // Live GPU path is Phase B+; stub records only.
    }
  }
}
