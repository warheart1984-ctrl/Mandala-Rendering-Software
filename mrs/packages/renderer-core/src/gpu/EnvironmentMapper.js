/**
 * Environment Mapping for 4D Renderer
 * Supports reflections, environment lighting, and skybox rendering
 */

export class EnvironmentMapper {
  constructor(device, options = {}) {
    this.device = device;
    this.size = options.size ?? 512;
    this.format = options.format ?? 'rgba16float';
    
    this.environmentTexture = null;
    this.irradianceTexture = null;
    this.prefilterTexture = null;
    this.brdfTexture = null;
    this.sampler = null;
    
    this.reflectionStrength = options.reflectionStrength ?? 0.5;
    this.roughness = options.roughness ?? 0.5;
    this.metallic = options.metallic ?? 0.5;
  }
  
  async init() {
    // Create environment texture (cubemap)
    this.environmentTexture = this.device.createTexture({
      size: [this.size, this.size, 6],
      dimension: '2d-array',
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Create irradiance texture (lower resolution)
    this.irradianceTexture = this.device.createTexture({
      size: [32, 32, 6],
      dimension: '2d-array',
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Create prefiltered environment texture for roughness
    this.prefilterTexture = this.device.createTexture({
      size: [128, 128, 6, 5], // 5 roughness levels
      dimension: '2d-array',
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUBufferUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Create BRDF lookup texture
    this.brdfTexture = this.device.createTexture({
      size: [512, 256],
      format: 'rg16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUBufferUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Create sampler
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    
    // Generate default environment
    await this.generateDefaultEnvironment();
    
    // Generate BRDF LUT
    await this.generateBRDFLUT();
    
    return this;
  }
  
  async generateDefaultEnvironment() {
    // Generate a procedural gradient skybox
    const shaderCode = `
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
      }
      
      @fragment
      fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> vec4<f32> {
        let uv = fragCoord.xy / vec2<f32>(512.0, 512.0);
        let dir = normalize(vec3<f32>(uv * 2.0 - 1.0, 1.0));
        
        // Gradient sky
        let horizon = mix(vec3<f32>(0.02, 0.03, 0.05), vec3<f32>(0.1, 0.15, 0.2), dir.y * 0.5 + 0.5);
        let zenith = mix(vec3<f32>(0.0, 0.02, 0.05), vec3<f32>(0.05, 0.1, 0.2), dir.y);
        
        let color = mix(horizon, zenith, smoothstep(-0.1, 0.1, dir.y));
        
        // Add some stars
        let noise = fract(sin(dot(dir.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);
        if (noise > 0.998 && dir.y > 0.3) {
          color += vec3<f32>(0.8, 0.9, 1.0) * (noise - 0.998) * 500.0;
        }
        
        return vec4<f32>(color, 1.0);
      }
    `;
    
    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Render to each face of cubemap
    for (let face = 0; face < 6; face++) {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.environmentTexture.createView({ baseArrayLayer: face, arrayLayerCount: 1 }),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(pipeline);
      pass.draw(3, 1, 0, 0);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }
  }
  
  async generateBRDFLUT() {
    const shaderCode = `
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
      }
      
      fn integrateBRDF(NdotV: f32, roughness: f32) -> vec2<f32> {
        let V = vec3<f32>(sqrt(1.0 - NdotV * NdotV), 0.0, NdotV);
        let N = vec3<f32>(0.0, 0.0, 1.0);
        
        var A = 0.0;
        var B = 0.0;
        
        for (var i = 0u; i < 1024u; i++) {
          let xi = hammersley(i, 1024u);
          let H = importanceSampleGGX(xi, N, roughness);
          let L = normalize(2.0 * dot(V, H) * H - V);
          let NdotL = max(L.z, 0.0);
          
          if (NdotL > 0.0) {
            let NdotH = max(dot(N, H), 0.0);
            let VdotH = max(dot(V, H), 0.0);
            
            let G = geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
            let G_Vis = (G * VdotH) / (NdotH * NdotV + 1e-5);
            let Fc = pow(1.0 - VdotH, 5.0);
            
            A += (1.0 - Fc) * G_Vis;
            B += Fc * G_Vis;
          }
        }
        
        return vec2<f32>(A / 1024.0, B / 1024.0);
      }
      
      fn hammersley(i: u32, N: u32) -> vec2<f32> {
        let E1 = f32(i) / f32(N);
        let E2 = fract(f32(i) * 0.5245277998707735);
        return vec2<f32>(E1, E2);
      }
      
      fn importanceSampleGGX(xi: vec2<f32>, N: vec3<f32>, roughness: f32) -> vec3<f32> {
        let a = roughness * roughness;
        let phi = 2.0 * 3.14159 * xi.x;
        let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
        let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
        
        let H = vec3<f32>(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
        
        // Tangent space to world space
        let up = abs(N.z) < 0.999 ? vec3<f32>(0.0, 0.0, 1.0) : vec3<f32>(1.0, 0.0, 0.0);
        let tangent = normalize(cross(up, N));
        let bitangent = cross(N, tangent);
        
        return tangent * H.x + bitangent * H.y + N * H.z;
      }
      
      fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
        let a = roughness;
        let k = (a * a) / 2.0;
        return NdotV / (NdotV * (1.0 - k) + k);
      }
      
      @fragment
      fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> vec4<f32> {
        let uv = fragCoord.xy / vec2<f32>(512.0, 256.0);
        let NdotV = uv.x;
        let roughness = uv.y;
        
        let integrated = integrateBRDF(NdotV, roughness);
        return vec4<f32>(integrated, 0.0, 1.0);
      }
    `;
    
    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rg16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.brdfTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
    pass.setPipeline(pipeline);
    pass.draw(3, 1, 0, 0);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  
  async loadEnvironmentTexture(imageData) {
    // Load HDR environment texture from image data
    // This would typically use a texture loader like ktx-parse or similar
    // For now, we'll use the procedural environment
    console.log('Environment texture loading not yet implemented, using procedural');
  }
  
  getBindGroupLayout() {
    return this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
  }
  
  createBindGroup(bindGroupLayout) {
    return this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
        { binding: 1, resource: this.irradianceTexture.createView({ dimension: 'cube' }) },
        { binding: 2, resource: this.prefilterTexture.createView({ dimension: 'cube-array' }) },
        { binding: 3, resource: this.brdfTexture.createView() },
        { binding: 4, resource: this.sampler }
      ]
    });
  }
  
  updateSettings(settings) {
    if (settings.reflectionStrength !== undefined) {
      this.reflectionStrength = settings.reflectionStrength;
    }
    if (settings.roughness !== undefined) {
      this.roughness = settings.roughness;
    }
    if (settings.metallic !== undefined) {
      this.metallic = settings.metallic;
    }
  }
  
  getReflectionShaderCode() {
    return `
      @group(0) @binding(0) var environmentTexture: texture_cube<f32>;
      @group(0) @binding(1) var irradianceTexture: texture_cube<f32>;
      @group(0) @binding(2) var prefilterTexture: texture_cube_array<f32>;
      @group(0) @binding(3) var brdfTexture: texture_2d<f32>;
      @group(0) @binding(4) var envSampler: sampler;
      @group(0) @binding(5) var<uniform> envParams: array<f32>;
      
      fn sampleEnvironment(normal: vec3<f32>, roughness: f32) -> vec3<f32> {
        let reflectionStrength = envParams[0];
        let metallic = envParams[1];
        
        // Sample irradiance for diffuse
        let irradiance = textureSample(irradianceTexture, envSampler, normal).rgb;
        
        // Sample prefiltered environment for specular
        let roughnessLevel = u32(roughness * 4.0);
        let prefiltered = textureSampleLevel(prefilterTexture, envSampler, normal, roughnessLevel, roughnessLevel).rgb;
        
        // Sample BRDF LUT
        let NdotV = max(normal.z, 0.0);
        let brdf = textureSample(brdfTexture, envSampler, vec2<f32>(NdotV, roughness)).rg;
        
        // Combine diffuse and specular
        let diffuse = irradiance * (1.0 - metallic);
        let specular = prefiltered * (brdf.x + brdf.y);
        
        return mix(diffuse, specular, metallic) * reflectionStrength;
      }
    `;
  }
}

export async function createEnvironmentMapper(device, options = {}) {
  const mapper = new EnvironmentMapper(device, options);
  await mapper.init();
  return mapper;
}
