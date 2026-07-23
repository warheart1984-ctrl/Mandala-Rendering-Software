import { WebGPURenderDevice } from "./WebGPURenderDevice.js";
import { CanvasRenderDevice } from "./CanvasRenderDevice.js";
import { VulkanRenderDevice } from "./VulkanRenderDevice.js";
import { TemporalAA } from "./taa.js";

export class Renderer {
  constructor(device, options = {}) {
    this.device = device;
    this.temporalAA = options.enableTAA ? new TemporalAA(device.width, device.height) : null;
    this.profiler = { frameTime: 0, drawCalls: 0, triangles: 0 };
    this._frameStart = 0;
  }

  static async create(type, options = {}) {
    let device;
    switch (type) {
      case "webgpu":
        device = new WebGPURenderDevice(options);
        break;
      case "canvas":
        device = new CanvasRenderDevice(options.canvas, options);
        break;
      case "vulkan":
        device = new VulkanRenderDevice(options);
        break;
      default:
        throw new Error(`Unknown render device type: ${type}`);
    }
    await device.init();
    return new Renderer(device, options);
  }

  beginFrame() {
    this._frameStart = performance.now();
    this.device.beginFrame();
    this.profiler.drawCalls = 0;
    this.profiler.triangles = 0;
  }

  endFrame() {
    this.device.endFrame();
    this.profiler.frameTime = performance.now() - this._frameStart;
  }

  clear(color) {
    this.device.clear(color);
  }

  drawMesh(mesh, transform, material) {
    this.device.drawMesh(mesh, transform, material);
    this.profiler.drawCalls++;
    if (mesh?.faces) this.profiler.triangles += mesh.faces.length;
  }

  drawWireframe(mesh, transform, color) {
    this.device.drawWireframe(mesh, transform, color);
    this.profiler.drawCalls++;
  }

  drawVertices(mesh, transform, color) {
    this.device.drawVertices(mesh, transform, color);
    this.profiler.drawCalls++;
  }

  async present() {
    let pixels = await this.device.present();
    if (this.temporalAA && pixels) {
      this.temporalAA.accumulate(pixels);
      pixels = this.temporalAA.resolve();
    }
    return pixels;
  }

  resize(width, height) {
    this.device.resize(width, height);
    if (this.temporalAA) this.temporalAA.resize(width, height);
  }

  getStats() {
    return {
      deviceType: this.device.type,
      ...this.profiler,
      taaEnabled: !!this.temporalAA,
    };
  }

  release() {
    this.device.release();
  }
}
