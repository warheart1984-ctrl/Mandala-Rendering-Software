/**
 * Post-Processing Pipeline for 4D Renderer
 * Supports bloom, tone mapping, chromatic aberration, and more
 */

export class PostProcessor {
  constructor(device, options = {}) {
    this.device = device;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    
    // Settings
    this.bloomEnabled = options.bloomEnabled ?? true;
    this.bloomThreshold = options.bloomThreshold ?? 1.0;
    this.bloomStrength = options.bloomStrength ?? 0.5;
    this.bloomRadius = options.bloomRadius ?? 0.5;
    
    this.toneMappingEnabled = options.toneMappingEnabled ?? true;
    this.exposure = options.exposure ?? 1.0;
    this.contrast = options.contrast ?? 1.0;
    this.saturation = options.saturation ?? 1.0;
    
    this.chromaticAberrationEnabled = options.chromaticAberrationEnabled ?? true;
    this.chromaticAberrationStrength = options.chromaticAberrationStrength ?? 0.005;
    
    this.vignetteEnabled = options.vignetteEnabled ?? false;
    this.vignetteStrength = options.vignetteStrength ?? 0.3;
    
    // Textures and pipelines
    this.sceneTexture = null;
    this.bloomTexture = null;
    this.pingpongTextures = [];
    this.uniformBuffer = null;
    this.sampler = null;
    
    this.pipelines = {};
    this.bindGroups = {};
  }
  
  async init() {
    // Create scene texture
    this.sceneTexture = this.device.createTexture({
      size: [this.width, this.height],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    
    // Create bloom texture (half resolution)
    this.bloomTexture = this.device.createTexture({
      size: [Math.floor(this.width / 2), Math.floor(this.height / 2)],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    
    // Create ping-pong textures for bloom blur
    for (let i = 0; i < 2; i++) {
      this.pingpongTextures.push(this.device.createTexture({
        size: [Math.floor(this.width / 2), Math.floor(this.height / 2)],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }));
    }
    
    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // Create sampler
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    
    // Create all pipelines
    await this.createPipelines();
    
    return this;
  }
  
  async createPipelines() {
    // Bloom threshold pipeline
    this.pipelines.bloomThreshold = await this.createBloomThresholdPipeline();
    
    // Bloom blur pipeline (separable Gaussian)
    this.pipelines.bloomBlur = await this.createBloomBlurPipeline();
    
    // Bloom combine pipeline
    this.pipelines.bloomCombine = await this.createBloomCombinePipeline();
    
    // Tone mapping pipeline
    this.pipelines.toneMapping = await this.createToneMappingPipeline();
    
    // Chromatic aberration pipeline
    this.pipelines.chromaticAberration = await this.createChromaticAberrationPipeline();
    
    // Final composite pipeline
    this.pipelines.composite = await this.createCompositePipeline();
  }
  
  async createBloomThresholdPipeline() {
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;
      @group(0) @binding(2) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        let color = textureSample(inputTexture, inputSampler, input.uv);
        let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        let threshold = params[0];
        if (brightness < threshold) {
          return vec4<f32>(0.0);
        }
        return color;
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'rgba16float');
  }
  
  async createBloomBlurPipeline() {
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;
      @group(0) @binding(2) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        let texelSize = vec2<f32>(params[0], params[1]);
        let direction = vec2<f32>(params[2], params[3]);
        let radius = params[4];
        
        var color = vec3<f32>(0.0);
        var totalWeight = 0.0;
        
        for (var i = -4; i <= 4; i++) {
          let offset = direction * texelSize * f32(i) * radius;
          let weight = 1.0 - abs(f32(i)) / 5.0;
          color += textureSample(inputTexture, inputSampler, input.uv + offset).rgb * weight;
          totalWeight += weight;
        }
        
        return vec4<f32>(color / totalWeight, 1.0);
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'rgba16float');
  }
  
  async createBloomCombinePipeline() {
    const shaderCode = `
      @group(0) @binding(0) var sceneTexture: texture_2d<f32>;
      @group(0) @binding(1) var bloomTexture: texture_2d<f32>;
      @group(0) @binding(2) var inputSampler: sampler;
      @group(0) @binding(3) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        let sceneColor = textureSample(sceneTexture, inputSampler, input.uv);
        let bloomColor = textureSample(bloomTexture, inputSampler, input.uv);
        let strength = params[0];
        
        return vec4<f32>(sceneColor.rgb + bloomColor.rgb * strength, 1.0);
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'rgba16float');
  }
  
  async createToneMappingPipeline() {
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;
      @group(0) @binding(2) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      fn aces(color: vec3<f32>) -> vec3<f32> {
        let a = 2.51;
        let b = 0.03;
        let c = 2.43;
        let d = 0.59;
        let e = 0.14;
        return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        var color = textureSample(inputTexture, inputSampler, input.uv).rgb;
        let exposure = params[0];
        let contrast = params[1];
        let saturation = params[2];
        
        // Exposure
        color = color * exposure;
        
        // Tone mapping (ACES)
        color = aces(color);
        
        // Contrast
        color = (color - 0.5) * contrast + 0.5;
        
        // Saturation
        let gray = dot(color, vec3<f32>(0.299, 0.587, 0.114));
        color = mix(vec3<f32>(gray), color, saturation);
        
        return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'rgba16float');
  }
  
  async createChromaticAberrationPipeline() {
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;
      @group(0) @binding(2) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        let strength = params[0];
        let center = vec2<f32>(0.5, 0.5);
        let dir = input.uv - center;
        let dist = length(dir);
        let offset = normalize(dir) * dist * strength;
        
        let r = textureSample(inputTexture, inputSampler, input.uv + offset).r;
        let g = textureSample(inputTexture, inputSampler, input.uv).g;
        let b = textureSample(inputTexture, inputSampler, input.uv - offset).b;
        
        return vec4<f32>(r, g, b, 1.0);
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'rgba16float');
  }
  
  async createCompositePipeline() {
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;
      @group(0) @binding(2) var<uniform> params: array<f32>;
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }
      
      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        output.uv.y = 1.0 - output.uv.y;
        return output;
      }
      
      @fragment
      fn fs_main(input: VertexOutput) -> vec4<f32> {
        let color = textureSample(inputTexture, inputSampler, input.uv);
        
        // Vignette
        let vignetteStrength = params[0];
        let center = vec2<f32>(0.5, 0.5);
        let dist = length(input.uv - center);
        let vignette = 1.0 - smoothstep(0.3, 0.8, dist) * vignetteStrength;
        
        return vec4<f32>(color.rgb * vignette, 1.0);
      }
    `;
    
    return this.createRenderPipeline(shaderCode, 'bgra8unorm');
  }
  
  async createRenderPipeline(shaderCode, format) {
    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });
    
    return this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }]
      },
      primitive: { topology: 'triangle-list' }
    });
  }
  
  updateUniforms() {
    const uniforms = new Float32Array(64);
    let i = 0;
    
    // Bloom params
    uniforms[i++] = this.bloomThreshold;
    uniforms[i++] = this.bloomStrength;
    uniforms[i++] = this.bloomRadius;
    
    // Tone mapping params
    uniforms[i++] = this.exposure;
    uniforms[i++] = this.contrast;
    uniforms[i++] = this.saturation;
    
    // Chromatic aberration
    uniforms[i++] = this.chromaticAberrationStrength;
    
    // Vignette
    uniforms[i++] = this.vignetteStrength;
    
    // Texture size
    uniforms[i++] = this.width;
    uniforms[i++] = this.height;
    
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }
  
  createBindGroup(texture, pipelineName) {
    const bindGroupLayout = this.pipelines[pipelineName].getBindGroupLayout(0);
    
    let bindings = [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: this.sampler },
      { binding: 2, resource: { buffer: this.uniformBuffer } }
    ];
    
    // For bloom combine, we need two textures
    if (pipelineName === 'bloomCombine') {
      bindings = [
        { binding: 0, resource: this.sceneTexture.createView() },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.uniformBuffer } }
      ];
    }
    
    return this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: bindings
    });
  }
  
  process(commandEncoder, sourceTexture) {
    this.updateUniforms();
    
    // Bloom pass
    if (this.bloomEnabled) {
      // Threshold
      let bindGroup = this.createBindGroup(sourceTexture, 'bloomThreshold');
      let pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.bloomTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.bloomThreshold);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      
      // Blur (horizontal)
      const blurParams = new Float32Array([2.0 / this.width, 2.0 / this.height, 1.0, 0.0, this.bloomRadius]);
      this.device.queue.writeBuffer(this.uniformBuffer, 32, blurParams);
      bindGroup = this.createBindGroup(this.bloomTexture, 'bloomBlur');
      pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.pingpongTextures[0].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.bloomBlur);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      
      // Blur (vertical)
      blurParams.set([2.0 / this.width, 2.0 / this.height, 0.0, 1.0, this.bloomRadius]);
      this.device.queue.writeBuffer(this.uniformBuffer, 32, blurParams);
      bindGroup = this.createBindGroup(this.pingpongTextures[0], 'bloomBlur');
      pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.pingpongTextures[1].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.bloomBlur);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      
      // Combine
      bindGroup = this.createBindGroup(this.pingpongTextures[1], 'bloomCombine');
      pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.sceneTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.bloomCombine);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }
    
    // Tone mapping
    if (this.toneMappingEnabled) {
      let bindGroup = this.createBindGroup(this.sceneTexture, 'toneMapping');
      let pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.pingpongTextures[0].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.toneMapping);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }
    
    // Chromatic aberration
    if (this.chromaticAberrationEnabled) {
      let bindGroup = this.createBindGroup(this.pingpongTextures[0], 'chromaticAberration');
      let pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.pingpongTextures[1].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(this.pipelines.chromaticAberration);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }
    
    // Final composite
    let bindGroup = this.createBindGroup(this.pingpongTextures[1], 'composite');
    let pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: sourceTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
    pass.setPipeline(this.pipelines.composite);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }
  
  resize(width, height) {
    this.width = width;
    this.height = height;
    
    // Recreate textures with new size
    // (In production, you'd want to handle this more gracefully)
  }
}

export async function createPostProcessor(device, options = {}) {
  const processor = new PostProcessor(device, options);
  await processor.init();
  return processor;
}
