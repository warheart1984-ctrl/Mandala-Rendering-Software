/**
 * Shadow Mapping for 4D Surfaces
 * Generates shadow maps from a light source in 4D space
 */

export class ShadowMapper {
  constructor(device, options = {}) {
    this.device = device;
    this.size = options.size ?? 2048;
    this.shadowMap = null;
    this.shadowSampler = null;
    this.shadowPipeline = null;
    this.shadowBindGroup = null;
    this.shadowUniformBuffer = null;
    this.lightPosition = options.lightPosition ?? { x: 5, y: 5, z: 5, w: 5 };
    this.lightTarget = options.lightTarget ?? { x: 0, y: 0, z: 0, w: 0 };
  }
  
  async init() {
    // Create shadow map texture
    this.shadowMap = this.device.createTexture({
      size: [this.size, this.size],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    
    this.shadowSampler = this.device.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    
    // Create uniform buffer for light matrices
    this.shadowUniformBuffer = this.device.createBuffer({
      size: 256, // 4x4 view matrix + 4x4 projection matrix
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // Create shadow pass pipeline
    await this.createShadowPipeline();
    
    return this;
  }
  
  async createShadowPipeline() {
    const shaderCode = `
      struct ShadowUniforms {
        viewMatrix: mat4x4<f32>,
        projMatrix: mat4x4<f32>,
      }
      
      @group(0) @binding(0) var<uniform> uniforms: ShadowUniforms;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) worldPos: vec4<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        // Full-screen triangle for raymarching
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.worldPos = vec4<f32>(0.0);
        return output;
      }
      
      @fragment
      fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> f32 {
        // Raymarch to find depth
        let dimensions = vec2<f32>(uniforms.projMatrix[0][0], uniforms.projMatrix[1][1]);
        var uv = (fragCoord.xy - dimensions * 0.5) / dimensions.y;
        
        let ro = uniforms.viewMatrix[3].xyz; // Extract camera position
        let rd = normalize(vec3<f32>(uv, 1.0));
        
        var t = 0.0;
        for (var i = 0u; i < 128u; i++) {
          let p = ro + rd * t;
          let d = sdfScene(p); // This would be your SDF function
          if (abs(d) < 0.001) break;
          if (t > 100.0) break;
          t += max(abs(d) * 0.8, 0.001);
        }
        
        return t;
      }
      
      fn sdfScene(p: vec3<f32>) -> f32 {
        // Placeholder SDF - would be replaced with actual surface
        return length(p) - 1.0;
      }
    `;
    
    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });
    
    this.shadowPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: []
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float'
      }
    });
    
    this.shadowBindGroupLayout = bindGroupLayout;
    this.shadowBindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.shadowUniformBuffer } }]
    });
  }
  
  updateLightMatrices(lightPos, lightTarget, up = { x: 0, y: 1, z: 0, w: 0 }) {
    // Create view matrix (look at)
    const zAxis = normalize(subtract(lightPos, lightTarget));
    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);
    
    const viewMatrix = new Float32Array([
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      -dot(xAxis, lightPos), -dot(yAxis, lightPos), -dot(zAxis, lightPos), 1
    ]);
    
    // Create projection matrix (perspective)
    const aspect = 1.0;
    const fov = Math.PI / 4;
    const near = 0.1;
    const far = 100.0;
    
    const f = 1.0 / Math.tan(fov / 2);
    const projMatrix = new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0
    ]);
    
    // Upload to uniform buffer
    const uniforms = new Float32Array(32);
    uniforms.set(viewMatrix, 0);
    uniforms.set(projMatrix, 16);
    
    this.device.queue.writeBuffer(this.shadowUniformBuffer, 0, uniforms);
  }
  
  renderShadowPass(commandEncoder) {
    const shadowPass = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowMap.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });
    
    shadowPass.setPipeline(this.shadowPipeline);
    shadowPass.setBindGroup(0, this.shadowBindGroup);
    shadowPass.draw(3, 1, 0, 0);
    shadowPass.end();
  }
  
  getShadowBindGroup(index = 0) {
    return this.device.createBindGroup({
      layout: this.shadowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.shadowUniformBuffer } },
        { binding: 1, resource: this.shadowSampler },
        { binding: 2, resource: this.shadowMap.createView() }
      ]
    });
  }
}

// Vector math helpers
function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
  return { x: v.x / len, y: v.y / len, z: v.z / len, w: v.w / len };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z, w: a.w - b.w };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
    w: 0
  };
}

export async function createShadowMapper(device, options = {}) {
  const mapper = new ShadowMapper(device, options);
  await mapper.init();
  return mapper;
}
