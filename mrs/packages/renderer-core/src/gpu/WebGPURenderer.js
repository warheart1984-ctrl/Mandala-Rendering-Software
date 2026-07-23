/**
 * 4D SDF Raymarcher — GPU Pipeline
 * Constitutional artifact per S4DE v2.0 Article IV.2
 */

import { Camera4D } from "../camera/Camera4D.js";
import { createFrameEvidence } from "../camera/Camera4D.js";

export function isWebGPUSupported(scope = globalThis) {
  return Boolean(scope?.navigator?.gpu?.requestAdapter);
}

export class WebGPURenderer {
  constructor(options = {}) {
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.maxSteps = options.maxSteps ?? 128;
    this.epsilon = options.epsilon ?? 0.001;
    this.maxDistance = options.maxDistance ?? 100;
    this.camera = options.camera ?? new Camera4D({ width: this.width, height: this.height });
    this.sdfType = options.sdfType ?? "gyroid";
    this.sdfParams = options.sdfParams ?? {};
    this.showNormals = options.showNormals ?? false;
    this.showDepth = options.showDepth ?? false;
    this.canvas = options.canvas ?? null;
    this.requestedAdapter = options.adapter ?? null;
    this.adapterId = options.adapterId ?? null;
    
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.uniformBuffer = null;
    this.frameCount = 0;
    this.format = null;
    this.deviceLost = null;
  }

  async init() {
    if (this.device) return { canvas: this.canvas, context: this.context, device: this.device };
    if (!isWebGPUSupported()) {
      throw new Error("WebGPU not supported in this environment");
    }

    const adapter = this.requestedAdapter ?? await navigator.gpu.requestAdapter({
      powerPreference: "high-performance"
    });
    if (!adapter) throw new Error("No WebGPU adapter found");

    this.device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: 1 << 24,
        maxBindGroups: 4,
        maxUniformBufferBindingSize: 1 << 16
      }
    });
    this.deviceLost = this.device.lost.then((info) => { this.device = null; this.pipeline = null; this.lastDeviceLoss = info; return info; });

    // Use provided canvas or create HTML canvas
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    
    this.context = this.canvas.getContext("webgpu");

    const format = navigator.gpu.getPreferredCanvasFormat();
    this.format = format;
    this.context.configure({
      device: this.device,
      format,
      alphaMode: "premultiplied"
    });

    await this.createPipeline(format);
    await this.createUniformBuffer();
    
    return { canvas: this.canvas, context: this.context, device: this.device };
  }

  async createPipeline(format) {
    // Load shader
    const shaderModule = this.device.createShaderModule({
      code: await this.loadShader()
    });

    // Uniform bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
      ]
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-list" }
    });

    this.bindGroupLayout = bindGroupLayout;
  }

  async createUniformBuffer() {
    const uniformSize = 256; // bytes
    this.uniformBuffer = this.device.createBuffer({
      size: uniformSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    });
  }

  resize(width, height, devicePixelRatio = globalThis.devicePixelRatio ?? 1) {
    this.width = Math.max(1, Math.floor(width)); this.height = Math.max(1, Math.floor(height));
    this.camera.width = this.width; this.camera.height = this.height;
    if (this.canvas) { this.canvas.width = Math.max(1, Math.floor(this.width * devicePixelRatio)); this.canvas.height = Math.max(1, Math.floor(this.height * devicePixelRatio)); }
  }

  async loadShader() {
    // Inline WGSL shader for browser compatibility
    return `
// 4D SDF Library — WGSL
// All functions operate in 4D space: vec4<f32> = (x, y, z, w)

struct SceneParams {
  rotationSpeed: f32,
  shapeType: u32,
  shapeParam1: f32,
  shapeParam2: f32,
  shapeParam3: f32,
  padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: array<f32, 64>;

fn sdfHypersphere(p: vec4<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn sdfTesseract(p: vec4<f32>, s: vec4<f32>) -> f32 {
  let q = abs(p) - s;
  return length(max(q, vec4<f32>(0.0))) + min(max(q.x, max(q.y, max(q.z, q.w))), 0.0);
}

fn sdfHypertorus(p: vec4<f32>, R: f32, r: f32) -> f32 {
  let d1 = length(p.xy) - R;
  let d2 = length(p.zw) - r;
  return sqrt(d1*d1 + d2*d2);
}

fn sdfTorus3DIn4D(p: vec4<f32>, R: f32, r: f32) -> f32 {
  let d1 = length(p.xy) - R;
  let d2 = length(vec2<f32>(d1, p.z)) - r;
  return d2 + 0.3 * sin(p.w * 6.28318);
}

fn sdfGyroid4D(p: vec4<f32>, scale: f32) -> f32 {
  let s = p * scale;
  let gx = cos(s.x) * sin(s.y) + cos(s.y) * sin(s.z) + cos(s.z) * sin(s.w);
  let gy = cos(s.y) * sin(s.z) + cos(s.z) * sin(s.w) + cos(s.w) * sin(s.x);
  let gz = cos(s.z) * sin(s.w) + cos(s.w) * sin(s.x) + cos(s.x) * sin(s.y);
  let gw = cos(s.w) * sin(s.x) + cos(s.x) * sin(s.y) + cos(s.y) * sin(s.z);
  return 0.3 - length(vec4<f32>(gx, gy, gz, gw)) * 0.5;
}

fn rotateXW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(c * p.x - s * p.w, p.y, p.z, s * p.x + c * p.w);
}

fn rotateYZ(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, c * p.y - s * p.z, s * p.y + c * p.z, p.w);
}

fn rotateZW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, p.y, c * p.z - s * p.w, s * p.z + c * p.w);
}

fn rotateYW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, c * p.y - s * p.w, p.z, s * p.y + c * p.w);
}

fn rotateCinematic(p: vec4<f32>, t: f32) -> vec4<f32> {
  let r = p;
  let r1 = rotateXW(r, t * 0.7);
  let r2 = rotateYZ(r1, t * 1.1);
  let r3 = rotateZW(r2, t * 1.5);
  let r4 = rotateYW(r3, t * 2.0);
  return r4;
}

fn map(p: vec4<f32>, time: f32, params: SceneParams) -> f32 {
  let rp = rotateCinematic(p, time * params.rotationSpeed);
  
  var d = 1e9;
  
  if (params.shapeType == 0u) {
    d = sdfHypersphere(rp, params.shapeParam1);
  } else if (params.shapeType == 1u) {
    d = sdfHypertorus(rp, params.shapeParam1, params.shapeParam2);
  } else if (params.shapeType == 2u) {
    d = sdfGyroid4D(rp, params.shapeParam1);
  } else if (params.shapeType == 3u) {
    d = sdfTorus3DIn4D(rp, params.shapeParam1, params.shapeParam2);
  }
  
  return d;
}

fn normal4(p: vec4<f32>, time: f32, params: SceneParams, epsilon: f32) -> vec4<f32> {
  let e = max(epsilon * 2.0, 0.0005);
  return normalize(vec4<f32>(
    map(p + vec4<f32>(e,0.0,0.0,0.0),time,params)-map(p-vec4<f32>(e,0.0,0.0,0.0),time,params),
    map(p + vec4<f32>(0.0,e,0.0,0.0),time,params)-map(p-vec4<f32>(0.0,e,0.0,0.0),time,params),
    map(p + vec4<f32>(0.0,0.0,e,0.0),time,params)-map(p-vec4<f32>(0.0,0.0,e,0.0),time,params),
    map(p + vec4<f32>(0.0,0.0,0.0,e),time,params)-map(p-vec4<f32>(0.0,0.0,0.0,e),time,params)
  ));
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> vec4<f32> {
  // Full-screen triangle
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> vec4<f32> {
  // Extract uniforms
  let camPos = vec4<f32>(uniforms[0], uniforms[1], uniforms[2], uniforms[3]);
  let hpN = vec4<f32>(uniforms[4], uniforms[5], uniforms[6], uniforms[7]);
  let hpD = uniforms[8];
  let time = uniforms[32];
  let maxSteps = u32(uniforms[33]);
  let epsilon = uniforms[34];
  let maxDistance = uniforms[35];
  let shapeType = u32(uniforms[36]);
  let shapeParam1 = uniforms[37];
  let shapeParam2 = uniforms[38];
  let showNormals = uniforms[40] > 0.5;
  let showDepth = uniforms[41] > 0.5;
  
  let params = SceneParams(1.0, shapeType, shapeParam1, shapeParam2, 1.0, 0.0);
  
  // Ray setup
  let dimensions = vec2<f32>(uniforms[30], uniforms[31]);
  var uv = (fragCoord.xy - dimensions * 0.5) / dimensions.y;
  let ro = camPos;
  let rd = normalize(vec4<f32>(uv, 1.0, 0.0));
  
  // Raymarching
  var t = 0.0;
  var d = 0.0;
  for (var i = 0u; i < maxSteps; i++) {
    let p = ro + rd * t;
    d = map(p, time, params);
    if (abs(d) < epsilon || t > maxDistance) { break; }
    t += max(abs(d) * 0.8, epsilon * 0.5);
  }
  
  // Coloring
  var color = vec3<f32>(0.05, 0.07, 0.09);
  if (t < maxDistance) {
    let hitPos = ro + rd * t;
    if (showDepth) {
      color = vec3<f32>(t / maxDistance);
    } else {
      let w = hitPos.w;
      let normal = normal4(hitPos,time,params,epsilon);
      if (showNormals) { color = normal.xyz * 0.5 + 0.5; }
      else {
        let base = mix(vec3<f32>(0.12, 0.2, 0.31), vec3<f32>(0.77, 0.54, 0.35), clamp((w + 1.5) / 3.0,0.0,1.0));
        let diffuse = max(dot(normal.xyz,normalize(vec3<f32>(-0.35,-0.55,0.76))),0.0);
        let rim = pow(1.0-max(dot(normal.xyz,-rd.xyz),0.0),3.0);
        color = base * (0.24 + 0.9*diffuse) + vec3<f32>(0.2,0.32,0.45)*rim*0.35;
        color = mix(color,vec3<f32>(0.05,0.07,0.09),1.0-exp(-t*0.025));
      }
    }
  }
  
  return vec4<f32>(color, 1.0);
}
`;
  }

  updateUniforms(time) {
    const cam = this.camera;
    const hp = cam.getHyperplane();
    
    // Pack camera state into uniform buffer
    const uniforms = new Float32Array(64); // 256 bytes
    let i = 0;
    
    // Camera position
    uniforms[i++] = cam.position.x;
    uniforms[i++] = cam.position.y;
    uniforms[i++] = cam.position.z;
    uniforms[i++] = cam.position.w;
    
    // Hyperplane
    uniforms[i++] = hp.n.x;
    uniforms[i++] = hp.n.y;
    uniforms[i++] = hp.n.z;
    uniforms[i++] = hp.n.w;
    uniforms[i++] = hp.d;
    uniforms[i++] = 0; uniforms[i++] = 0; uniforms[i++] = 0; // padding
    
    // Orientation (SO(4) matrix, 16 floats)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        uniforms[i++] = cam.orientation[r * 4 + c];
      }
    }
    
    // Projection params
    uniforms[i++] = cam.d3;
    uniforms[i++] = cam.scale;
    uniforms[i++] = cam.width;
    uniforms[i++] = cam.height;
    
    // Time & config
    uniforms[i++] = time;
    uniforms[i++] = this.maxSteps;
    uniforms[i++] = this.epsilon;
    uniforms[i++] = this.maxDistance;
    
    // SDF type + params
    uniforms[i++] = this.getSDFTypeCode();
    uniforms[i++] = this.sdfParams.a ?? 1.5;
    uniforms[i++] = this.sdfParams.b ?? 0.5;
    uniforms[i++] = this.sdfParams.c ?? 1.0;
    
    // Flags
    uniforms[i++] = this.showNormals ? 1 : 0;
    uniforms[i++] = this.showDepth ? 1 : 0;
    uniforms[i++] = cam.projectionMode === "orthographic" ? 1 : 0;
    uniforms[i++] = 0;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  getSDFTypeCode() {
    const types = {
      hypersphere: 0, torus: 1, gyroid: 2, torus3d: 3,
      fbm: 4, ridged: 5, union: 10, intersect: 11, subtract: 12
    };
    return types[this.sdfType] ?? 2;
  }

  async renderFrame(time, canvas) {
    this.updateUniforms(time);
    
    const encoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.05, g: 0.07, b: 0.09, a: 1.0 },
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(3, 1, 0, 0); // Full-screen triangle
    renderPass.end();
    
    this.device.queue.submit([encoder.finish()]);
    
    // Capture frame evidence
    const evidence = createFrameEvidence(this.camera, this.frameCount++);
    evidence.pipeline = "SDF_RAYMARCH";
    evidence.sdfType = this.sdfType;
    evidence.maxSteps = this.maxSteps;
    evidence.epsilon = this.epsilon;
    return evidence;
  }

  async renderSequence(frames, outputDir, fps = 30) {
    // Initialize once at the start
    await this.init();
    
    const evidenceLog = [];
    
    for (let i = 0; i < frames; i++) {
      const t = (i / frames) * 8 * Math.PI;
      
      const evidence = await this.renderFrame(t, this.canvas);
      evidenceLog.push(evidence);
      
      if (i % 10 === 0) {
        console.log(`Raymarch: ${i + 1}/${frames}`);
      }
    }
    
    return { outputDir, frameCount: frames, evidenceLog };
  }
}

export async function createWebGPURenderer(options) {
  const renderer = new WebGPURenderer(options);
  await renderer.init();
  return renderer;
}

export async function createRendererWithFallback(options = {}) {
  if (isWebGPUSupported(options.scope ?? globalThis)) return createWebGPURenderer(options);
  if (typeof options.fallbackFactory === "function") return options.fallbackFactory(options);
  throw new Error("WebGPU unavailable and no Canvas fallbackFactory was supplied");
}
