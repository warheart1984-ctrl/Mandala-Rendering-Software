import { isWebGPUSupported } from "./WebGPURenderer.js";

const SOLID_SHADER = `
struct Uniforms {
  time: f32, d4: f32, d3: f32, scale: f32,
  width: f32, height: f32,
  weightXW: f32, weightYZ: f32, weightZW: f32, weightYW: f32,
  ambient: f32, diffuse: f32, specular: f32, shininess: f32,
  lightX: f32, lightY: f32, lightZ: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSInput {
  @location(0) x: f32, @location(1) y: f32, @location(2) z: f32, @location(3) w: f32,
};
struct VSOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) fragW: f32,
  @location(1) fragDepth: f32,
  @location(2) worldPos: vec3<f32>,
};

fn rc(p: vec4<f32>, t: f32) -> vec4<f32> {
  let c1 = cos(t * u.weightXW); let s1 = sin(t * u.weightXW);
  let r1 = vec4<f32>(c1 * p.x - s1 * p.w, p.y, p.z, s1 * p.x + c1 * p.w);
  let c2 = cos(t * u.weightYZ); let s2 = sin(t * u.weightYZ);
  let r2 = vec4<f32>(r1.x, c2 * r1.y - s2 * r1.z, s2 * r1.y + c2 * r1.z, r1.w);
  let c3 = cos(t * u.weightZW); let s3 = sin(t * u.weightZW);
  let r3 = vec4<f32>(r2.x, r2.y, c3 * r2.z - s3 * r2.w, s3 * r2.z + c3 * r2.w);
  let c4 = cos(t * u.weightYW); let s4 = sin(t * u.weightYW);
  return vec4<f32>(r3.x, c4 * r3.y - s4 * r3.w, r3.z, s4 * r3.y + c4 * r3.w);
}

@vertex
fn vs_main(in: VSInput) -> VSOutput {
  let rot = rc(vec4<f32>(in.x, in.y, in.z, in.w), u.time);
  let d4 = u.d4 - rot.w;
  if (d4 <= 0.001) { var o: VSOutput; o.pos = vec4<f32>(0,0,2,1); return o; }
  let k4 = u.d4 / d4;
  let p3 = vec3<f32>(k4 * rot.x, k4 * rot.y, k4 * rot.z);
  let d3 = u.d3 - p3.z;
  if (d3 <= 0.001) { var o: VSOutput; o.pos = vec4<f32>(0,0,2,1); return o; }
  let k3 = u.d3 / d3;
  let sx = u.width * 0.5 + k3 * p3.x * u.scale;
  let sy = u.height * 0.5 - k3 * p3.y * u.scale;
  var o: VSOutput;
  o.pos = vec4<f32>(sx / u.width * 2 - 1, sy / u.height * 2 - 1, p3.z, 1);
  o.fragW = rot.w; o.fragDepth = p3.z; o.worldPos = p3;
  return o;
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
  let wn = clamp((in.fragW + 1.5) / 3.0, 0, 1);
  let base = mix(vec3<f32>(0.118, 0.196, 0.314), vec3<f32>(0.769, 0.537, 0.353), wn);
  let dx = dpdx(in.worldPos); let dy = dpdy(in.worldPos);
  let n = normalize(cross(dx, dy));
  let ld = normalize(vec3<f32>(u.lightX, u.lightY, u.lightZ));
  let lam = max(0, -dot(n, ld));
  let rim = pow(1 - max(0, dot(n, normalize(-in.worldPos))), 3);
  let spec = pow(max(0, abs(n.z)), u.shininess);
  let lt = u.ambient + u.diffuse * lam + u.specular * spec;
  let fog = exp(-abs(in.fragDepth) * 0.025);
  let col = base * lt * fog + vec3<f32>(0.2, 0.32, 0.45) * rim * 0.35 * fog;
  let a = mix(0.4, 0.95, wn) * max(0.2, fog);
  return vec4<f32>(col, a);
}
`;

const WIREFRAME_SHADER = `
struct Uniforms {
  time: f32, d4: f32, d3: f32, scale: f32,
  width: f32, height: f32,
  weightXW: f32, weightYZ: f32, weightZW: f32, weightYW: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSInput {
  @location(0) x: f32, @location(1) y: f32, @location(2) z: f32, @location(3) w: f32,
};
struct VSOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) alpha: f32,
};

fn rc(p: vec4<f32>, t: f32) -> vec4<f32> {
  let c1 = cos(t * u.weightXW); let s1 = sin(t * u.weightXW);
  let r1 = vec4<f32>(c1 * p.x - s1 * p.w, p.y, p.z, s1 * p.x + c1 * p.w);
  let c2 = cos(t * u.weightYZ); let s2 = sin(t * u.weightYZ);
  let r2 = vec4<f32>(r1.x, c2 * r1.y - s2 * r1.z, s2 * r1.y + c2 * r1.z, r1.w);
  let c3 = cos(t * u.weightZW); let s3 = sin(t * u.weightZW);
  let r3 = vec4<f32>(r2.x, r2.y, c3 * r2.z - s3 * r2.w, s3 * r2.z + c3 * r2.w);
  let c4 = cos(t * u.weightYW); let s4 = sin(t * u.weightYW);
  return vec4<f32>(r3.x, c4 * r3.y - s4 * r3.w, r3.z, s4 * r3.y + c4 * r3.w);
}

@vertex
fn vs_main(in: VSInput) -> VSOutput {
  let rot = rc(vec4<f32>(in.x, in.y, in.z, in.w), u.time);
  let d4 = u.d4 - rot.w;
  if (d4 <= 0.001) { var o: VSOutput; o.pos = vec4<f32>(0,0,2,1); return o; }
  let k4 = u.d4 / d4;
  let p3 = vec3<f32>(k4 * rot.x, k4 * rot.y, k4 * rot.z);
  let d3 = u.d3 - p3.z;
  if (d3 <= 0.001) { var o: VSOutput; o.pos = vec4<f32>(0,0,2,1); return o; }
  let k3 = u.d3 / d3;
  let sx = u.width * 0.5 + k3 * p3.x * u.scale;
  let sy = u.height * 0.5 - k3 * p3.y * u.scale;
  let wn = clamp((rot.w + 1.5) / 3.0, 0, 1);
  let c = mix(vec3<f32>(0.314, 0.471, 0.784), vec3<f32>(0.863, 0.549, 0.314), wn);
  let a = mix(0.25, 0.9, wn);
  var o: VSOutput;
  o.pos = vec4<f32>(sx / u.width * 2 - 1, sy / u.height * 2 - 1, p3.z, 1);
  o.color = c; o.alpha = a;
  return o;
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, in.alpha);
}
`;

function uniformByteSize() { return 256; }

function makeUniformData(rs, t) {
  const b = new Float32Array(uniformByteSize() / 4);
  b[0]=t; b[1]=rs.d4; b[2]=rs.d3; b[3]=rs.scale;
  b[4]=rs.width; b[5]=rs.height;
  b[6]=rs.rotationWeights?.xw??0.7; b[7]=rs.rotationWeights?.yz??1.1;
  b[8]=rs.rotationWeights?.zw??1.5; b[9]=rs.rotationWeights?.yw??2.0;
  b[10]=rs.ambient??0.35; b[11]=rs.diffuse??0.75;
  b[12]=rs.specular??0.18; b[13]=rs.shininess??24;
  b[14]=rs.lightDir?.x??-0.35; b[15]=rs.lightDir?.y??-0.55; b[16]=rs.lightDir?.z??0.76;
  return b;
}

export class GPUMeshRenderer {
  constructor(device, options = {}) {
    this.device = device;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.sampleCount = options.sampleCount ?? 4;
    this.format = options.format ?? navigator.gpu?.getPreferredCanvasFormat?.() ?? "bgra8unorm";
    this.depthFormat = "depth24plus";
    this.texture = null;
    this.depthTexture = null;
    this.resolveTexture = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.edgeVertexBuffer = null;
    this.edgeCount = 0;
    this.indexCount = 0;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.solidPipeline = null;
    this.wireframePipeline = null;
    this.vbl = { arrayStride: 16, attributes: [
      { shaderLocation: 0, offset: 0, format: "float32" },
      { shaderLocation: 1, offset: 4, format: "float32" },
      { shaderLocation: 2, offset: 8, format: "float32" },
      { shaderLocation: 3, offset: 12, format: "float32" },
    ]};
    this.renderMode = options.renderMode ?? "solid";
    this.uniformsNeedUpdate = true;
  }

  async init() {
    const d = this.device;
    const bgl = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ]});
    this.uniformBuffer = d.createBuffer({ size: uniformByteSize(), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bindGroupLayout = bgl;
    this.bindGroup = d.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });

    const sm = d.createShaderModule({ code: SOLID_SHADER });
    this.solidPipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: sm, entryPoint: "vs_main", buffers: [this.vbl] },
      fragment: { module: sm, entryPoint: "fs_main", targets: [{
        format: this.format,
        blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } },
      }]},
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: this.depthFormat, depthWriteEnabled: true, depthCompare: "less" },
      multisample: { count: this.sampleCount },
    });

    const wm = d.createShaderModule({ code: WIREFRAME_SHADER });
    this.wireframePipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: wm, entryPoint: "vs_main", buffers: [this.vbl] },
      fragment: { module: wm, entryPoint: "fs_main", targets: [{
        format: this.format,
        blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } },
      }]},
      primitive: { topology: "line-list" },
      depthStencil: { format: this.depthFormat, depthWriteEnabled: true, depthCompare: "less" },
      multisample: { count: this.sampleCount },
    });
    return this;
  }

  uploadMesh(mesh) {
    const d = this.device;
    if (this.vertexBuffer) { this.vertexBuffer.destroy(); this.vertexBuffer = null; }
    if (this.indexBuffer) { this.indexBuffer.destroy(); this.indexBuffer = null; }
    if (this.edgeVertexBuffer) { this.edgeVertexBuffer.destroy(); this.edgeVertexBuffer = null; }

    const vd = new Float32Array(mesh.vertices.length * 4);
    for (let i = 0; i < mesh.vertices.length; i++) {
      const v = mesh.vertices[i];
      vd[i*4]=v.x; vd[i*4+1]=v.y; vd[i*4+2]=v.z; vd[i*4+3]=v.w;
    }
    this.vertexBuffer = d.createBuffer({ size: vd.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vertexBuffer, 0, vd);

    if (mesh.faces?.length) {
      const id = new Uint32Array(mesh.faces.flat());
      this.indexBuffer = d.createBuffer({ size: id.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(this.indexBuffer, 0, id);
      this.indexCount = id.length;
    } else this.indexCount = 0;

    if (mesh.edges?.length) {
      const ed = new Float32Array(mesh.edges.length * 2 * 4); let o = 0;
      for (const [i, j] of mesh.edges) {
        const vi=mesh.vertices[i], vj=mesh.vertices[j];
        ed[o++]=vi.x; ed[o++]=vi.y; ed[o++]=vi.z; ed[o++]=vi.w;
        ed[o++]=vj.x; ed[o++]=vj.y; ed[o++]=vj.z; ed[o++]=vj.w;
      }
      this.edgeVertexBuffer = d.createBuffer({ size: ed.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(this.edgeVertexBuffer, 0, ed);
      this.edgeCount = mesh.edges.length * 2;
    } else this.edgeCount = 0;

    this.uniformsNeedUpdate = true;
  }

  async renderFrame(t, rs = {}, textureView = null) {
    const d = this.device;
    const w = rs.width ?? this.width, h = rs.height ?? this.height;
    const mode = rs.renderMode ?? this.renderMode;

    if (!textureView) this.ensureTextures(w, h);

    if (this.uniformsNeedUpdate || this._lastT !== t) {
      d.queue.writeBuffer(this.uniformBuffer, 0, makeUniformData(rs, t));
      this._lastT = t;
      this.uniformsNeedUpdate = false;
    }

    const enc = d.createCommandEncoder();
    const ca = textureView
      ? { view: textureView, clearValue: { r:0.055, g:0.071, b:0.086, a:1 }, loadOp: "clear", storeOp: "store" }
      : { view: this.texture.createView(), resolveTarget: this.resolveTexture?.createView(),
          clearValue: { r:0.055, g:0.071, b:0.086, a:1 }, loadOp: "clear", storeOp: this.sampleCount > 1 ? "multisample" : "store" };

    const pass = enc.beginRenderPass({
      colorAttachments: [ca],
      depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });

    if ((mode === "solid" || mode === "both") && this.indexCount > 0) {
      pass.setPipeline(this.solidPipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, "uint32");
      pass.drawIndexed(this.indexCount);
    }
    if ((mode === "wireframe" || mode === "both") && this.edgeCount > 0) {
      pass.setPipeline(this.wireframePipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.edgeVertexBuffer);
      pass.draw(this.edgeCount);
    }
    pass.end();
    d.queue.submit([enc.finish()]);
    return { width: w, height: h, mode, triangles: this.indexCount / 3, edges: this.edgeCount / 2 };
  }

  ensureTextures(w, h) {
    if (this.texture && this._tw === w && this._th === h) return;
    this.destroyTextures();
    this._tw = w; this._th = h;
    const d = this.device, ms = this.sampleCount > 1;
    this.depthTexture = d.createTexture({ size: [w, h], format: this.depthFormat, sampleCount: ms ? this.sampleCount : 1, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    if (ms) {
      this.texture = d.createTexture({ size: [w, h], format: this.format, sampleCount: this.sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.resolveTexture = d.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    } else {
      this.texture = d.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
      this.resolveTexture = null;
    }
  }

  destroyTextures() {
    if (this.texture) { this.texture.destroy(); this.texture = null; }
    if (this.depthTexture) { this.depthTexture.destroy(); this.depthTexture = null; }
    if (this.resolveTexture) { this.resolveTexture.destroy(); this.resolveTexture = null; }
  }

  resize(w, h) { this.width = w; this.height = h; this.uniformsNeedUpdate = true; }
  setRenderMode(m) { this.renderMode = m; }

  release() {
    this.destroyTextures();
    if (this.vertexBuffer) { this.vertexBuffer.destroy(); this.vertexBuffer = null; }
    if (this.indexBuffer) { this.indexBuffer.destroy(); this.indexBuffer = null; }
    if (this.edgeVertexBuffer) { this.edgeVertexBuffer.destroy(); this.edgeVertexBuffer = null; }
    if (this.uniformBuffer) { this.uniformBuffer.destroy(); this.uniformBuffer = null; }
  }
}

export function isMeshRendererSupported() { return isWebGPUSupported(); }

export async function createGPUMeshRenderer(device, options = {}) {
  if (!isWebGPUSupported()) throw new Error("WebGPU required for GPU mesh rasterization");
  const r = new GPUMeshRenderer(device, options);
  await r.init();
  return r;
}
