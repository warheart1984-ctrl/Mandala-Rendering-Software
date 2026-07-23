import { RenderDevice } from "./RenderDevice.js";

export class WebGPURenderDevice extends RenderDevice {
  constructor(options = {}) {
    super("webgpu", options);
    this.device = null;
    this.queue = null;
    this.canvas = options.canvas ?? null;
    this.context = null;
    this.format = options.format ?? "bgra8unorm";
    this.sampleCount = options.sampleCount ?? 4;
    this.meshRenderer = null;
  }

  async init() {
    if (!navigator.gpu) throw new Error("WebGPU not available");
    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter.requestDevice();
    this.queue = this.device.queue;
    if (this.canvas) {
      this.context = this.canvas.getContext("webgpu");
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "premultiplied",
      });
    }
    const { createGPUMeshRenderer } = await import("../gpu/GPUMeshRenderer.js");
    this.meshRenderer = await createGPUMeshRenderer(this.device, {
      width: this.width,
      height: this.height,
      sampleCount: this.sampleCount,
      format: this.format,
    });
    this._initialized = true;
    this.onRelease(() => {
      if (this.meshRenderer) this.meshRenderer.release();
      if (this.device) this.device.destroy();
    });
    return this;
  }
}
