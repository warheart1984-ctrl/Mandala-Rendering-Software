import { isWebGPUSupported } from "./WebGPURenderer.js";
import { getSurface } from "../surfaces/index.js";

export class ComputeMeshSampler {
  constructor(device, options = {}) {
    this.device = device;
    this.maxVertices = options.maxVertices ?? 256 * 256;
    this.workgroupSize = options.workgroupSize ?? 64;
    this.surfaceCache = new Map();
    this.pipeline = null;
    this.bindGroup = null;
    this.paramBuffer = null;
    this.outputBuffer = null;
    this.outputStagingBuffer = null;
    this.surfaceType = null;
  }

  async init() {
    return this;
  }

  async compileShader(surface) {
    const shaderCode = this.buildComputeShader(surface);
    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    this.pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    this.bindGroupLayout = bindGroupLayout;
    this.surfaceType = surface.id;
    return this;
  }

  buildComputeShader(surface) {
    const code = surface.gpuSampleCode || this.defaultComputeShader(surface);
    return code;
  }

  defaultComputeShader(surface) {
    const paramCode = this.generateParamCode(surface);
    return `
      struct Params {
        resolution: f32,
        uMin: f32,
        uMax: f32,
        vMin: f32,
        vMax: f32,
        totalVerts: f32,
        _pad0: f32,
        _pad1: f32,
      }

      struct Vertex {
        x: f32,
        y: f32,
        z: f32,
        w: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;
      @group(0) @binding(1) var<storage, read_write> vertices: array<Vertex>;

      ${paramCode}

      @compute @workgroup_size(${this.workgroupSize})
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let idx = id.x;
        let total = u32(params.totalVerts);
        if (idx >= total) { return; }

        let res = u32(params.resolution);
        let i = idx / (res + 1u);
        let j = idx % (res + 1u);

        let uMin = params.uMin;
        let uMax = params.uMax;
        let vMin = params.vMin;
        let vMax = params.vMax;
        let uStep = (uMax - uMin) / f32(res);
        let vStep = (vMax - vMin) / f32(res);

        let u = uMin + f32(i) * uStep;
        let v = vMin + f32(j) * vStep;

        var pos = evaluate(u, v);
        vertices[idx] = pos;
      }
    `;
  }

  generateParamCode(surface) {
    return `
      fn evaluate(u: f32, v: f32) -> Vertex {
        var result: Vertex;
        ${surface.gpuParamCode || this.fallbackParamCode(surface)}
        return result;
      }
    `;
  }

  fallbackParamCode(surface) {
    switch (surface.id) {
      case "clifford-torus":
        return `
          let R = 1.5;
          let r = 0.8;
          let theta = u * 6.28318;
          let phi = v * 6.28318;
          result.x = (R + r * cos(theta)) * cos(phi);
          result.y = (R + r * cos(theta)) * sin(phi);
          result.z = r * sin(theta) * cos(phi + 1.57);
          result.w = r * sin(theta) * sin(phi + 1.57);
        `;
      case "hopf-surface":
        return `
          let theta = u * 6.28318;
          let phi = v * 6.28318;
          let t = theta * 0.5;
          let p = phi - theta;
          let st = sin(t);
          let ct = cos(t);
          let sp = sin(p);
          let cp = cos(p);
          result.x = ct * cp;
          result.y = ct * sp;
          result.z = st * cp;
          result.w = st * sp;
        `;
      case "torus-3d":
        return `
          let R = 1.5;
          let r = 0.6;
          let theta = u * 6.28318;
          let phi = v * 6.28318;
          result.x = (R + r * cos(theta)) * cos(phi);
          result.y = (R + r * cos(theta)) * sin(phi);
          result.z = r * sin(theta);
          result.w = 0.3 * sin(u * 6.28318 * 3.0 + v * 6.28318 * 2.0);
        `;
      case "trefoil-4d":
        return `
          let t = u * 6.28318;
          let s = v * 6.28318;
          let R = 1.5;
          let r = 0.5;
          let x = (R + r * cos(3.0 * t)) * cos(2.0 * t);
          let y = (R + r * cos(3.0 * t)) * sin(2.0 * t);
          let z = r * sin(3.0 * t) * cos(s);
          let w = r * sin(3.0 * t) * sin(s);
          result.x = x;
          result.y = y;
          result.z = z;
          result.w = w;
        `;
      default:
        return `
          result.x = u * 2.0 - 1.0;
          result.y = v * 2.0 - 1.0;
          result.z = sin(u * 6.28318) * cos(v * 6.28318);
          result.w = cos(u * 6.28318) * sin(v * 6.28318);
        `;
    }
  }

  async sampleSurface(surfaceId, resolution = 64) {
    const surface = getSurface(surfaceId);
    if (!surface) throw new Error(`Unknown surface: ${surfaceId}`);

    if (!this.pipeline || this.surfaceType !== surface.id) {
      await this.compileShader(surface);
    }

    const res = resolution ?? surface.defaultResolution ?? 64;
    const [uMin, uMax] = surface.uRange ?? [0, 1];
    const [vMin, vMax] = surface.vRange ?? [0, 1];
    const totalVerts = (res + 1) * (res + 1);

    this.paramBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const params = new Float32Array([
      res, uMin, uMax, vMin, vMax, totalVerts, 0, 0,
    ]);
    this.device.queue.writeBuffer(this.paramBuffer, 0, params);

    const vertexSize = 16;
    this.outputBuffer = this.device.createBuffer({
      size: totalVerts * vertexSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.outputStagingBuffer = this.device.createBuffer({
      size: totalVerts * vertexSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramBuffer } },
        { binding: 1, resource: { buffer: this.outputBuffer } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(totalVerts / this.workgroupSize));
    pass.end();

    encoder.copyBufferToBuffer(
      this.outputBuffer, 0,
      this.outputStagingBuffer, 0,
      totalVerts * vertexSize
    );

    this.device.queue.submit([encoder.finish()]);
    await this.outputStagingBuffer.mapAsync(GPUMapMode.READ);

    const data = this.outputStagingBuffer.getMappedRange();
    const vertexArray = new Float32Array(data.slice(0));
    this.outputStagingBuffer.unmap();

    const vertices = [];
    for (let i = 0; i < totalVerts; i++) {
      const off = i * 4;
      vertices.push({
        x: vertexArray[off],
        y: vertexArray[off + 1],
        z: vertexArray[off + 2],
        w: vertexArray[off + 3],
      });
    }

    const faces = [];
    const edgeSet = new Set();
    const addEdge = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeSet.add(key);
    };

    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = i * (res + 1) + j;
        const b = (i + 1) * (res + 1) + j;
        const c = i * (res + 1) + j + 1;
        const d = (i + 1) * (res + 1) + j + 1;
        faces.push([a, b, c]);
        faces.push([b, d, c]);
        addEdge(a, b); addEdge(a, c);
        addEdge(b, d); addEdge(c, d);
      }
    }

    return {
      vertices,
      faces,
      edges: [...edgeSet].map((s) => s.split(",").map(Number)),
      gpuGenerated: true,
    };
  }

  async batchSample(surfaces, resolutions = {}) {
    const results = {};
    for (const s of surfaces) {
      const id = typeof s === "string" ? s : s.id;
      const res = resolutions[id] ?? 64;
      results[id] = await this.sampleSurface(id, res);
    }
    return results;
  }

  release() {
    if (this.paramBuffer) { this.paramBuffer.destroy(); this.paramBuffer = null; }
    if (this.outputBuffer) { this.outputBuffer.destroy(); this.outputBuffer = null; }
    if (this.outputStagingBuffer) { this.outputStagingBuffer.destroy(); this.outputStagingBuffer = null; }
    this.pipeline = null;
    this.bindGroup = null;
  }
}

export async function createComputeMeshSampler(device, options = {}) {
  if (!isWebGPUSupported()) {
    throw new Error("WebGPU not supported — GPU compute mesh sampling requires WebGPU");
  }
  const sampler = new ComputeMeshSampler(device, options);
  await sampler.init();
  return sampler;
}
