import { RenderDevice } from "./RenderDevice.js";

export class VulkanRenderDevice extends RenderDevice {
  constructor(options = {}) {
    super("vulkan", options);
    this.producer = null;
    this.previewClient = null;
    this._fallback = null;
  }

  async init() {
    const { createSovereignXGPUPreviewDispatch } = await import("../gpu/SovereignXRenderAdapter.js");
    const dispatch = createSovereignXGPUPreviewDispatch();
    this.producer = dispatch;
    this._initialized = true;
    return this;
  }

  async beginFrame() {}

  async endFrame() {}

  clear(color) {}

  drawMesh(mesh, transform, material) {}

  drawWireframe(mesh, transform, color) {}

  drawVertices(mesh, transform, color) {}

  async present() {
    if (this.producer && this.producer.sendFrame) {
      return this.producer.sendFrame(null);
    }
  }

  readPixels() {
    return null;
  }

  useFallback(fallbackDevice) {
    this._fallback = fallbackDevice;
  }

  release() {
    super.release();
    this.producer = null;
    if (this._fallback) this._fallback.release();
  }
}
