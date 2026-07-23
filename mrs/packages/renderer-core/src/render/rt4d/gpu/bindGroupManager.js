/**
 * Bind group layout and bind group management for RT4D multi-pass GPU pipeline.
 * Pass 0: raygen (camera → rays)
 * Pass 1: bvh traversal (rays → hits)
 * Pass 2: shade (hits → color + scatter)
 * Pass 3: accumulate (progressive averaging)
 */
export class BindGroupManager {
  constructor(device) {
    this.device = device;
    this._layouts = {};
    this._groups = {};
  }

  createRaygenLayout() {
    if (this._layouts.raygen) return this._layouts.raygen;
    this._layouts.raygen = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    return this._layouts.raygen;
  }

  createBVHLayout() {
    if (this._layouts.bvh) return this._layouts.bvh;
    this._layouts.bvh = this.device.createBindGroupLayout({
      entries: [
        { binding: 0,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 3,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 6,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 7,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 8,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 9,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    return this._layouts.bvh;
  }

  createShadeLayout() {
    if (this._layouts.shade) return this._layouts.shade;
    this._layouts.shade = this.device.createBindGroupLayout({
      entries: [
        { binding: 0,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 3,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 6,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 7,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 8,  visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    return this._layouts.shade;
  }

  createAccumLayout() {
    if (this._layouts.accum) return this._layouts.accum;
    this._layouts.accum = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    return this._layouts.accum;
  }

  createRaygenGroup(buffers) {
    return this.device.createBindGroup({
      layout: this.createRaygenLayout(),
      entries: [
        { binding: 0, resource: { buffer: buffers.camera } },
        { binding: 1, resource: { buffer: buffers.rayOrigins } },
        { binding: 2, resource: { buffer: buffers.rayDirs } },
        { binding: 3, resource: { buffer: buffers.rayTMin } },
        { binding: 4, resource: { buffer: buffers.rayTMax } },
      ],
    });
  }

  createBVHGroup(buffers) {
    return this.device.createBindGroup({
      layout: this.createBVHLayout(),
      entries: [
        { binding: 0,  resource: { buffer: buffers.nodes } },
        { binding: 1,  resource: { buffer: buffers.spheres } },
        { binding: 2,  resource: { buffer: buffers.planes } },
        { binding: 3,  resource: { buffer: buffers.meshTris } },
        { binding: 4,  resource: { buffer: buffers.primType } },
        { binding: 5,  resource: { buffer: buffers.primOffset } },
        { binding: 6,  resource: { buffer: buffers.rayOrigins } },
        { binding: 7,  resource: { buffer: buffers.rayDirs } },
        { binding: 8,  resource: { buffer: buffers.rayTMin } },
        { binding: 9,  resource: { buffer: buffers.rayTMax } },
        { binding: 10, resource: { buffer: buffers.hits } },
      ],
    });
  }

  createShadeGroup(buffers) {
    return this.device.createBindGroup({
      layout: this.createShadeLayout(),
      entries: [
        { binding: 0, resource: { buffer: buffers.frameParams } },
        { binding: 1, resource: { buffer: buffers.hits } },
        { binding: 2, resource: { buffer: buffers.materials } },
        { binding: 3, resource: { buffer: buffers.lights } },
        { binding: 4, resource: { buffer: buffers.rayDirs } },
        { binding: 5, resource: { buffer: buffers.rayOrigins } },
        { binding: 6, resource: { buffer: buffers.rayOriginsOut } },
        { binding: 7, resource: { buffer: buffers.scatterDirs } },
        { binding: 8, resource: { buffer: buffers.pathThroughput } },
      ],
    });
  }

  createAccumGroup(buffers) {
    return this.device.createBindGroup({
      layout: this.createAccumLayout(),
      entries: [
        { binding: 0, resource: { buffer: buffers.accumBuffer } },
        { binding: 1, resource: { buffer: buffers.outputBuffer } },
        { binding: 2, resource: { buffer: buffers.frameParams } },
      ],
    });
  }
}
