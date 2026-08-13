/**
 * Temporal Denoiser - CPU Reference Implementation
 * BIT_EXACT determinism
 */

export class TemporalDenoiser {
  constructor(config = {}) {
    this.historyLength = config.historyLength || 8;
    this.sigmaColor = config.sigmaColor || 0.1;
    this.sigmaNormal = config.sigmaNormal || 0.1;
    this.sigmaDepth = config.sigmaDepth || 0.1;
    this.lobeAngle = config.lobeAngle || 0.1;
    this.history = [];
    this.maxHistory = this.historyLength;
  }

  /**
   * Add frame to history
   */
  addFrame(frame) {
    this.history.push({
      radiance: frame.radiance,
      albedo: frame.albedo,
      normal: frame.normal,
      depth: frame.depth,
      motion: frame.motion,
      camera: frame.camera
    });
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Denoise current frame using temporal history
   */
  denoise(currentFrame) {
    const { radiance, albedo, normal, depth, motion, camera } = currentFrame;
    const width = Math.sqrt(radiance.length / 3);
    const height = radiance.length / 3 / width;
    
    const denoised = new Float32Array(radiance.length);
    
    if (this.history.length === 0) {
      // First frame - just return current
      this.addFrame(currentFrame);
      return new Float32Array(radiance);
    }
    
    // A-Trous wavelet denoising with temporal reprojection
    const denoisedRadiance = this._atrousDenoise(currentFrame);
    
    this.addFrame(currentFrame);
    return denoisedRadiance;
  }

  _atrousDenoise(currentFrame) {
    const { radiance, albedo, normal, depth, motion } = currentFrame;
    const width = Math.sqrt(radiance.length / 3);
    const height = radiance.length / 3 / width;
    
    let filtered = new Float32Array(radiance);
    
    // Multi-scale filtering (A-Trous)
    const scales = [1, 2, 4, 8];
    for (const scale of scales) {
      const temp = new Float32Array(filtered.length);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3;
          let sum = [0, 0, 0];
          let weightSum = 0;
          
          // Center pixel
          const centerAlbedo = albedo.slice(idx, idx + 3);
          const centerNormal = normal.slice(idx, idx + 3);
          const centerDepth = depth[y * width + x];
          
          // Sample neighbors at this scale
          const offsets = [[0, 0], [scale, 0], [-scale, 0], [0, scale], [0, -scale]];
          
          for (const [dx, dy] of offsets) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            
            const nIdx = (ny * width + nx) * 3;
            const neighborAlbedo = albedo.slice(nIdx, nIdx + 3);
            const neighborNormal = normal.slice(nIdx, nIdx + 3);
            const neighborDepth = depth[ny * width + nx];
            
            // Similarity weights
            const albedoDiff = Math.abs(centerAlbedo[0] - neighborAlbedo[0]) +
                              Math.abs(centerAlbedo[1] - neighborAlbedo[1]) +
                              Math.abs(centerAlbedo[2] - neighborAlbedo[2]);
            
            const normalDiff = 1 - (centerNormal[0] * neighborNormal[0] + 
                                   centerNormal[1] * neighborNormal[1] + 
                                   centerNormal[2] * neighborNormal[2]);
            
            const depthDiff = Math.abs(centerDepth - neighborDepth);
            
            const wAlbedo = Math.exp(-albedoDiff / 0.05);
            const wNormal = Math.exp(-normalDiff / 0.1);
            const wDepth = Math.exp(-depthDiff / 0.1);
            
            const weight = wAlbedo * wNormal * wDepth;
            
            temp[idx] += filtered[nIdx] * weight;
            temp[idx + 1] += filtered[nIdx + 1] * weight;
            temp[idx + 2] += filtered[nIdx + 2] * weight;
            weightSum += weight;
          }
          
          if (weightSum > 0) {
            temp[idx] /= weightSum;
            temp[idx + 1] /= weightSum;
            temp[idx + 2] /= weightSum;
          } else {
            temp[idx] = filtered[idx];
            temp[idx + 1] = filtered[idx + 1];
            temp[idx + 2] = filtered[idx + 2];
          }
        }
      }
      filtered = temp;
    }
    
    // Temporal reprojection (reproject previous frame)
    if (this.history.length > 0) {
      const prevFrame = this.history[this.history.length - 1];
      const reprojected = this._reprojectFrame(currentFrame, prevFrame);
      
      // Blend with temporal
      for (let i = 0; i < filtered.length; i++) {
        filtered[i] = filtered[i] * 0.8 + reprojected[i] * 0.2;
      }
    }
    
    return filtered;
  }

  _reprojectFrame(current, prev) {
    // Simple temporal reprojection using motion vectors
    // In production: use motion vectors for accurate reprojection
    const width = Math.sqrt(current.radiance.length / 3);
    const height = current.radiance.length / 3 / width;
    
    const result = new Float32Array(current.radiance.length);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        
        // Use motion vector to find corresponding pixel in previous frame
        if (current.motion) {
          const mvIdx = (y * width + x) * 2;
          const mvx = current.motion[mvIdx];
          const mvy = current.motion[mvIdx + 1];
          
          const srcX = x - mvx;
          const srcY = y - mvy;
          
          if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
            const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 3;
            result[idx] = prev.radiance[srcIdx];
            result[idx + 1] = prev.radiance[srcIdx + 1];
            result[idx + 2] = prev.radiance[srcIdx + 2];
          } else {
            result[idx] = current.radiance[idx];
            result[idx + 1] = current.radiance[idx + 1];
            result[idx + 2] = current.radiance[idx + 2];
          }
        } else {
          result[idx] = current.radiance[idx];
          result[idx + 1] = current.radiance[idx + 1];
          result[idx + 2] = current.radiance[idx + 2];
        }
      }
    }
    
    return result;
  }
}

/**
 * OIDN Denoiser Wrapper (GPU Accelerated)
 * NUMERIC_EQUIVALENT determinism class
 */
export class OIDNDenoiser {
  constructor(config = {}) {
    this.quality = config.quality || "high"; // "low", "medium", "high"
    this.useGPU = config.useGPU !== false;
    this.cleanAux = config.cleanAux !== false;
  }

  async denoise(frame) {
    // Placeholder for OIDN integration
    // Would call native OIDN library via WebAssembly or native addon
    // For now, fallback to temporal denoiser
    const temporal = new TemporalDenoiser({ historyLength: 8 });
    return temporal.denoise(frame);
  }
}

/**
 * Variance estimation for adaptive sampling
 */
export function estimateVariance(radiance, width, height, tileSize = 16) {
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const variance = new Float32Array(tilesX * tilesY);
  
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      let sum = [0, 0, 0];
      let sumSq = [0, 0, 0];
      let count = 0;
      
      for (let y = ty * tileSize; y < Math.min((ty + 1) * tileSize, height); y++) {
        for (let x = tx * tileSize; x < Math.min((tx + 1) * tileSize, width); x++) {
          const idx = (y * width + x) * 3;
          for (let c = 0; c < 3; c++) {
            const v = radiance[idx + c];
            sum[c] += v;
            sumSq[c] += v * v;
          }
          count++;
        }
      }
      
      let maxVar = 0;
      for (let c = 0; c < 3; c++) {
        const mean = sum[c] / count;
        const varC = sumSq[c] / count - mean * mean;
        maxVar = Math.max(maxVar, varC);
      }
      variance[ty * tilesX + tx] = maxVar;
    }
  }
  
  return variance;
}

export function adaptiveSampleAllocation(variance, totalSPP, minSPP = 1, maxSPP = 256) {
  const sumVar = variance.reduce((a, b) => a + b, 0);
  const avgVar = sumVar / variance.length;
  
  return variance.map(v => {
    const ratio = avgVar > 0 ? v / avgVar : 1;
    const spp = Math.round(minSPP + (maxSPP - minSPP) * ratio);
    return Math.min(maxSPP, Math.max(minSPP, spp));
  });
}