# Post-Processing Chain Implementation Plan

## Overview

Build production-grade post-processing pipeline for Mandala Renderer. Current state: CPU Lambert stand-in. Target: GPU-accelerated path tracer with full AOV support.

## Architecture

```
RT4DGPURenderer.outputBuffer
    ↓
PostProcessor
    ↓
[AOVs: color, depth, normal, albedo, roughness, emission]
    ↓
[Compose]
    ↓
[TAA] → [Denoise] → [Tone Map] → [Bloom] → [Vignette]
    ↓
Final Image
```

---

## File Structure

```
mrs/packages/renderer-core/src/render/rt4d/postprocessing/
├── PostProcessor.js           # Main orchestrator
├── TAA.js                     # Temporal Anti-Aliasing
├── Denoiser.js                # AI/SS denoising
├── ToneMapper.js              # ACES, Reinhard, etc.
├── Bloom.js                   # Bloom extraction + blur
├── Vignette.js                # Vignette + film grain
├── Compositor.js              # AOV composition
└── shaders/
    ├── taa.wgsl
    ├── denoise.wgsl
    ├── tonemap.wgsl
    ├── bloom.wgsl
    └── vignette.wgsl
```

---

## 1. PostProcessor Orchestrator

```javascript
// PostProcessor.js

export class PostProcessor {
  constructor(device, width, height) {
    this.device = device;
    this.width = width;
    this.height = height;
    
    this.textures = {
      color: null,
      depth: null,
      normal: null,
      albedo: null,
      roughness: null,
      emission: null
    };
    
    this.taa = new TAA(device, width, height);
    this.denoiser = new Denoiser(device, width, height);
    this.toneMapper = new ToneMapper(device, width, height);
    this.bloom = new Bloom(device, width, height);
    this.vignette = new Vignette(device, width, height);
  }
  
  async init() {
    await this.taa.init();
    await this.denoiser.init();
    await this.toneMapper.init();
    await this.bloom.init();
    await this.vignette.init();
  }
  
  process(renderOutput, options = {}) {
    // Step 1: Upload render buffer to texture
    this.uploadRenderToTexture(renderOutput);
    
    // Step 2: Temporal Anti-Aliasing
    let result = this.taa.process(
      this.textures.color,
      options.previousFrame
    );
    
    // Step 3: Denoising
    result = this.denoiser.process(
      result,
      this.textures.normal,
      this.textures.albedo
    );
    
    // Step 4: Tone Mapping
    result = this.toneMapper.process(result, {
      method: options.toneMap || 'aces',
      exposure: options.exposure || 1.0
    });
    
    // Step 5: Bloom
    if (options.bloom) {
      const bloom = this.bloom.process(result, {
        threshold: options.bloomThreshold || 1.0,
        intensity: options.bloomIntensity || 0.5
      });
      result = this.combine(result, bloom);
    }
    
    // Step 6: Vignette
    result = this.vignette.process(result, {
      strength: options.vignetteStrength || 0.3
    });
    
    return result;
  }
  
  uploadRenderToTexture(buffer) {
    // Create texture from render buffer
    this.textures.color = this.device.createTexture({
      size: [this.width, this.height, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.COPY_DST
    });
    
    this.device.queue.writeTexture(
      { texture: this.textures.color },
      buffer,
      { bytesPerRow: this.width * 8 },
      { width: this.width, height: this.height }
    );
  }
}
```

---

## 2. Temporal Anti-Aliasing (TAA)

```javascript
// TAA.js

export class TAA {
  constructor(device, width, height) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.history = null;
    this.motionVectors = null;
  }
  
  async init() {
    this.history = this.device.createTexture({
      size: [this.width, this.height, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.STORAGE_BINDING
    });
    
    this.motionVectors = this.device.createTexture({
      size: [this.width, this.height, 1],
      format: 'rg16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.STORAGE_BINDING
    });
    
    this.pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: TAA_WGSL }),
        entryPoint: 'main'
      }
    });
  }
  
  process(currentFrame, previousFrame) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.getBindGroup(currentFrame, previousFrame));
    pass.dispatchWorkgroups(
      Math.ceil(this.width / 8),
      Math.ceil(this.height / 8)
    );
    
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    
    return this.outputTexture;
  }
}
```

**TAA WGSL:**
```wgsl
// taa.wgsl

@group(0) @binding(0) var current: texture_2d<f32>;
@group(0) @binding(1) var history: texture_2d<f32>;
@group(0) @binding(2) var motionVectors: texture_2d<f32>;
@group(0) @binding(3) var output: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let uv = vec2<f32>(gid.xy) / vec2<f32>(width, height);
  let mv = textureLoad(motionVectors, vec2<i32>(gid.xy), 0).rg;
  let prevUv = uv - mv;
  
  let curr = textureLoad(current, vec2<i32>(gid.xy), 0);
  let hist = textureLoad(history, vec2<i32>(prevUv * vec2<f32>(width, height)), 0);
  
  // Blend with history
  let blendFactor = 0.1;
  let result = mix(hist, curr, blendFactor);
  
  textureStore(output, vec2<i32>(gid.xy), result);
}
```

---

## 3. Denoiser

Use existing `WaveField.js` noise patterns or integrate with Sovereign X router for AI denoising.

```javascript
// Denoiser.js

export class Denoiser {
  constructor(device, width, height) {
    this.device = device;
    this.width = width;
    this.height = height;
  }
  
  async init() {
    // Load denoising shader
    // Can use OpenCL kernel from Axiom-X or WGSL
    this.pipeline = this.device.createComputePipeline({
      compute: {
        module: this.device.createShaderModule({ code: DENOISE_WGSL }),
        entryPoint: 'main'
      }
    });
  }
  
  process(color, normal, albedo) {
    // SS denoising using normal and albedo as guides
    // Similar to Intel OIDN or NVIDIA OptiX denoiser
  }
}
```

---

## 4. Tone Mapper

```wgsl
// tonemap.wgsl

fn aces_tonemap(color: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let color = textureLoad(input, vec2<i32>(gid.xy), 0).rgb;
  let tonemapped = aces_tonemap(color * exposure);
  textureStore(output, vec2<i32>(gid.xy), vec4<f32>(tonemapped, 1.0));
}
```

---

## 5. Bloom

```javascript
// Bloom.js

export class Bloom {
  constructor(device, width, height) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.pingPongTextures = [];
  }
  
  async init() {
    // Create downscaled textures for blur passes
    for (let i = 0; i < 4; i++) {
      const size = Math.max(1, Math.floor(this.width / Math.pow(2, i)));
      this.pingPongTextures.push(this.createTexture(size, size));
    }
  }
  
  process(color, options) {
    // 1. Extract bright areas
    // 2. Downsample cascade
    // 3. Gaussian blur each level
    // 4. Upsample and combine
    // 5. Add back to original
  }
}
```

---

## 6. Compositor

```javascript
// Compositor.js

export class Compositor {
  processPasses(passes) {
    // Combine AOVs:
    // final = color * exposure + emission + (albedo * lights)
    // Apply normal-based lighting
    // Apply roughness-based specular
  }
}
```

---

## Integration with RT4DGPURenderer

```javascript
// In RT4DGPURenderer.js

export class RT4DGPURenderer {
  constructor(options) {
    // ... existing
    this.postProcessor = null;
  }
  
  async init(canvas) {
    // ... existing init
    
    this.postProcessor = new PostProcessor(this.device, this.width, this.height);
    await this.postProcessor.init();
  }
  
  async render(scene, camera, options = {}) {
    // ... existing render logic
    
    // Post-process
    const finalImage = this.postProcessor.process(result, {
      toneMap: options.toneMap,
      exposure: options.exposure,
      bloom: options.bloom,
      previousFrame: this.previousFrame
    });
    
    this.previousFrame = finalImage;
    return finalImage;
  }
}
```

---

## Testing

```javascript
// postprocessing.test.js

test('TAA reduces flickering', async () => {
  const pp = new PostProcessor(device, 64, 64);
  await pp.init();
  
  // Render same scene twice with different noise
  const frame1 = await render({ seed: 1 });
  const frame2 = await render({ seed: 2 });
  
  const result = pp.taa.process(frame2, frame1);
  
  // Result should be smoother than raw frame2
  expect(result.variance).toBeLessThan(frame2.variance);
});

test('tone mapping preserves highlights', async () => {
  const input = vec4(10.0, 10.0, 10.0, 1.0);
  const result = toneMapper.process(input, { method: 'aces' });
  
  expect(result.r).toBeLessThan(1.0);
  expect(result.r).toBeGreaterThan(0.0);
});

test('bloom extracts bright areas', async () => {
  const input = vec4(2.0, 2.0, 2.0, 1.0);
  const bloom = await bloom.process(input, { threshold: 1.0 });
  
  expect(bloom.r).toBeGreaterThan(0.0);
});
```

---

## Implementation Timeline

### Week 1: Core Post-Processing
- [ ] Create PostProcessor orchestrator
- [ ] Implement TAA
- [ ] Implement tone mapping
- [ ] Integrate with RT4DGPURenderer

### Week 2: Advanced Effects
- [ ] Implement bloom
- [ ] Implement denoise
- [ ] Implement vignette
- [ ] AOV composition system
- [ ] End-to-end test: render → post-process → final image

---

## Performance Targets

- TAA: < 2ms @ 1080p
- Denoise: < 5ms @ 1080p
- Tone map: < 1ms @ 1080p
- Bloom: < 3ms @ 1080p
- Total post-processing: < 15ms @ 1080p

---

## Dependencies

- WebGPU device with compute support
- WGSL shader compilation
- Render buffer with AOVs

---

## Next Steps

After post-processing:
1. Close constitutional runtime loop
2. Integrate state store with renderer
3. End-to-end test with character materials
