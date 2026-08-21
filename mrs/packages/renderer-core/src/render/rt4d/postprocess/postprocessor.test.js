/**
 * PostProcessor Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PostProcessor } from './postprocessor.js';
import { applyPostProcessing, PostProcessPresets } from './postprocess-integration.js';

describe('PostProcessor', () => {
  test('creates with default settings', () => {
    const pp = new PostProcessor();
    assert.ok(pp.enableTAA);
    assert.ok(pp.enableDenoise);
    assert.ok(pp.enableBloom);
    assert.ok(pp.enableToneMapping);
    assert.ok(pp.enableVignette);
  });

  test('creates with custom settings', () => {
    const pp = new PostProcessor({
      enableTAA: false,
      enableBloom: false,
      toneMappingMode: 'Reinhard'
    });
    assert.equal(pp.enableTAA, false);
    assert.equal(pp.enableBloom, false);
    assert.equal(pp.toneMappingMode, 'Reinhard');
  });

  test('builds pipeline correctly', () => {
    const pp = new PostProcessor({
      enableTAA: false,
      enableVignette: false
    });
    assert.ok(!pp.stages.includes('taa'));
    assert.ok(!pp.stages.includes('vignette'));
    assert.ok(pp.stages.includes('denoise'));
    assert.ok(pp.stages.includes('composite'));
  });

  test('processes frame through pipeline', () => {
    const pp = new PostProcessor();
    const frame = {
      pixels: [
        { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        { r: 0.8, g: 0.2, b: 0.1, a: 1.0 }
      ],
      width: 2,
      height: 1
    };

    const processed = pp.processFrame(frame, { width: 2, height: 1 });
    
    assert.ok(processed);
    assert.ok(processed.pixels);
    assert.ok(processed.postprocess);
    assert.ok(processed.composite);
  });

  test('TAA blends frames', () => {
    const pp = new PostProcessor({ enableTAA: true, taalStrength: 0.5 });
    
    const frame1 = {
      pixels: [{ r: 0.0, g: 0.0, b: 0.0, a: 1.0 }]
    };
    
    const frame2 = {
      pixels: [{ r: 1.0, g: 1.0, b: 1.0, a: 1.0 }]
    };

    pp.processFrame(frame1, {});
    const processed = pp.processFrame(frame2, {});

    // TAA should blend
    assert.ok(processed.postprocess.taaApplied);
    assert.ok(processed.pixels[0].r > 0.4 && processed.pixels[0].r < 0.6);
  });

  test('denoise reduces noise level', () => {
    const pp = new PostProcessor({ enableDenoise: true });
    const frame = {
      pixels: [{ r: 0.5, g: 0.5, b: 0.5, a: 1.0 }],
      noiseLevel: 0.5
    };

    const processed = pp.processFrame(frame, {});
    
    assert.ok(processed.postprocess.denoiseApplied);
    assert.ok(processed.noiseLevel < frame.noiseLevel);
  });

  test('bloom detects bright pixels', () => {
    const pp = new PostProcessor({ enableBloom: true, bloomThreshold: 0.5 });
    const frame = {
      pixels: [
        { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
        { r: 0.9, g: 0.9, b: 0.9, a: 1.0 }
      ]
    };

    const processed = pp.processFrame(frame, {});
    
    assert.ok(processed.bloom);
    assert.ok(processed.bloom.active);
    assert.ok(processed.bloom.intensity > 0);
    assert.ok(processed.postprocess.bloomApplied);
  });

  test('tone mapping applies ACES', () => {
    const pp = new PostProcessor({ enableToneMapping: true, toneMappingMode: 'ACES', exposure: 1.0 });
    const frame = {
      pixels: [{ r: 2.0, g: 2.0, b: 2.0, a: 1.0 }]
    };

    const processed = pp.processFrame(frame, {});
    
    assert.ok(processed.postprocess.toneMapped);
    assert.equal(processed.postprocess.toneMappingMode, 'ACES');
    // ACES should clamp to [0,1]
    assert.ok(processed.pixels[0].r >= 0 && processed.pixels[0].r <= 1);
  });

  test('tone mapping applies Reinhard', () => {
    const pp = new PostProcessor({ enableToneMapping: true, toneMappingMode: 'Reinhard', exposure: 1.0 });
    const frame = {
      pixels: [{ r: 2.0, g: 2.0, b: 2.0, a: 1.0 }]
    };

    const processed = pp.processFrame(frame, {});
    
    assert.ok(processed.postprocess.toneMapped);
    assert.equal(processed.postprocess.toneMappingMode, 'Reinhard');
  });

  test('vignette darkens edges', () => {
    const pp = new PostProcessor({ enableVignette: true, vignetteStrength: 0.5 });
    const frame = {
      pixels: Array(100).fill({ r: 1.0, g: 1.0, b: 1.0, a: 1.0 })
    };

    const processed = pp.processFrame(frame, { width: 10, height: 10 });
    
    assert.ok(processed.postprocess.vignetteApplied);
    // Vignette should modify pixels
    assert.ok(processed.pixels.length === 100);
  });

  test('reset clears temporal history', () => {
    const pp = new PostProcessor();
    pp.processFrame({ pixels: [{ r: 0.5, g: 0.5, b: 0.5 }] }, {});
    
    assert.ok(pp.previousFrame);
    assert.equal(pp.frameIndex, 1);
    
    pp.reset();
    
    assert.equal(pp.previousFrame, null);
    assert.equal(pp.frameIndex, 0);
  });

  test('getConfig returns configuration', () => {
    const pp = new PostProcessor({ enableBloom: false });
    const config = pp.getConfig();
    
    assert.ok(config.stages);
    assert.equal(config.enableBloom, false);
    assert.ok(config.enableTAA);
  });

  test('updateSettings rebuilds pipeline', () => {
    const pp = new PostProcessor({ enableBloom: true });
    assert.ok(pp.stages.includes('bloom'));
    
    pp.updateSettings({ enableBloom: false });
    assert.ok(!pp.stages.includes('bloom'));
  });
});

describe('PostProcessing Integration', () => {
  test('applyPostProcessing converts and processes frame', () => {
    const pp = new PostProcessor();
    const frame = {
      pixels: new Uint8ClampedArray([255, 128, 0, 255, 0, 0, 0, 255]),
      width: 2,
      height: 1
    };

    const processed = applyPostProcessing(frame, pp);
    
    assert.ok(processed);
    assert.ok(processed.pixels);
    assert.ok(processed.postprocess);
    assert.equal(processed.width, 2);
    assert.equal(processed.height, 1);
  });

  test('applyPostProcessing returns frame if no processor', () => {
    const frame = {
      pixels: new Uint8ClampedArray([255, 128, 0, 255]),
      width: 1,
      height: 1
    };

    const processed = applyPostProcessing(frame, null);
    
    assert.strictEqual(processed, frame);
  });

  test('PostProcessPresets defined', () => {
    assert.ok(PostProcessPresets.production);
    assert.ok(PostProcessPresets.performance);
    assert.ok(PostProcessPresets.cinematic);
    assert.ok(PostProcessPresets.minimal);
  });

  test('production preset has all features enabled', () => {
    assert.ok(PostProcessPresets.production.enableTAA);
    assert.ok(PostProcessPresets.production.enableDenoise);
    assert.ok(PostProcessPresets.production.enableBloom);
    assert.ok(PostProcessPresets.production.enableToneMapping);
    assert.ok(PostProcessPresets.production.enableVignette);
  });

  test('minimal preset has minimal features', () => {
    assert.ok(!PostProcessPresets.minimal.enableTAA);
    assert.ok(!PostProcessPresets.minimal.enableDenoise);
    assert.ok(!PostProcessPresets.minimal.enableBloom);
    assert.ok(!PostProcessPresets.minimal.enableVignette);
    assert.ok(PostProcessPresets.minimal.enableToneMapping);
  });
});
