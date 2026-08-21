/**
 * Post-Processing Integration for RT4D Renderer
 * Integrates PostProcessor with RT4DGPURenderer
 */

import { PostProcessor } from './postprocessor.js';

/**
 * Apply post-processing to rendered frame
 * @param {Object} frameData - Raw frame from renderer
 * @param {PostProcessor} postProcessor - Post-processor instance
 * @returns {Object} Processed frame
 */
export function applyPostProcessing(frameData, postProcessor) {
  if (!postProcessor || !frameData) {
    return frameData;
  }
  
  // Convert Uint8ClampedArray to pixel objects
  const pixels = frameData.pixels || new Uint8ClampedArray();
  const pixelObjects = [];
  
  for (let i = 0; i < pixels.length; i += 4) {
    pixelObjects.push({
      r: pixels[i] / 255,
      g: pixels[i + 1] / 255,
      b: pixels[i + 2] / 255,
      a: pixels[i + 3] / 255
    });
  }
  
  // Process through post-processing chain
  const processed = postProcessor.processFrame({
    pixels: pixelObjects,
    width: frameData.width,
    height: frameData.height
  }, {
    width: frameData.width,
    height: frameData.height
  });
  
  // Convert back to Uint8ClampedArray
  const outputPixels = new Uint8ClampedArray(pixels.length);
  
  if (processed.pixels && processed.pixels.length === pixelObjects.length) {
    for (let i = 0; i < processed.pixels.length; i++) {
      const p = processed.pixels[i];
      outputPixels[i * 4] = Math.round(Math.max(0, Math.min(255, p.r * 255)));
      outputPixels[i * 4 + 1] = Math.round(Math.max(0, Math.min(255, p.g * 255)));
      outputPixels[i * 4 + 2] = Math.round(Math.max(0, Math.min(255, p.b * 255)));
      outputPixels[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, (p.a || 1) * 255)));
    }
  } else {
    // Fallback to original pixels
    outputPixels.set(pixels);
  }
  
  return {
    ...frameData,
    pixels: outputPixels,
    postprocess: processed.postprocess,
    composite: processed.composite
  };
}

/**
 * Create post-processed renderer wrapper
 * @param {Object} renderer - RT4DGPURenderer instance
 * @param {Object} options - Post-processing options
 * @returns {Object} Wrapped renderer with post-processing
 */
export function withPostProcessing(renderer, options = {}) {
  const postProcessor = new PostProcessor(options);
  
  const originalRender = renderer.render.bind(renderer);
  
  renderer.render = async function(scene, camera, renderOptions = {}) {
    const result = await originalRender(scene, camera, renderOptions);
    return applyPostProcessing(result, postProcessor);
  };
  
  renderer.postProcessor = postProcessor;
  
  return renderer;
}

/**
 * Post-processing preset configurations
 */
export const PostProcessPresets = {
  production: {
    enableTAA: true,
    enableDenoise: true,
    enableBloom: true,
    enableToneMapping: true,
    enableVignette: true,
    tonalMappingMode: 'ACES',
    exposure: 1.0,
    bloomStrength: 0.5,
    taonStrength: 0.95
  },
  
  performance: {
    enableTAA: false,
    enableDenoise: true,
    enableBloom: false,
    enableToneMapping: true,
    enableVignette: false,
    toneMappingMode: 'Reinhard',
    exposure: 1.0
  },
  
  cinematic: {
    enableTAA: true,
    enableDenoise: true,
    enableBloom: true,
    enableToneMapping: true,
    enableVignette: true,
    toneMappingMode: 'ACES',
    exposure: 1.2,
    bloomStrength: 0.7,
    vignetteStrength: 0.4,
    taonStrength: 0.98
  },
  
  minimal: {
    enableTAA: false,
    enableDenoise: false,
    enableBloom: false,
    enableToneMapping: true,
    enableVignette: false
  }
};
