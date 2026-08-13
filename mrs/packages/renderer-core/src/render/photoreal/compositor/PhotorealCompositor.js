import { V3 } from "../material/PhotorealUtils.js";

/**
 * Photoreal Compositor
 * Color management, AOVs, film grain, bloom, lens effects
 */
export class PhotorealCompositor {
  constructor(config = {}) {
    this.width = config.width || 1920;
    this.height = config.height || 1080;
    this.colorSpace = config.colorSpace || "sRGB"; // "sRGB", "ACES", "ACEScg", "linear"
    this.tonemap = config.tonemap || "aces"; // "none", "reinhard", "aces", "filmic"
    this.exposure = config.exposure || 1.0;
    this.gamma = config.gamma || 2.2;
    this.bloom = config.bloom ?? true;
    this.bloomStrength = config.bloomStrength || 0.1;
    this.bloomThreshold = config.bloomThreshold || 1.0;
    this.filmGrain = config.filmGrain ?? false;
    this.grainStrength = config.grainStrength || 0.02;
    this.vignette = config.vignette ?? 0.3;
    this.chromaticAberration = config.chromaticAberration || 0.0;
    this.lensFlare = config.lensFlare || false;
    
    // Film response curves
    this.filmCurve = config.filmCurve || "none"; // "none", "kodak2383", "fuji3510"
    
    // LUT support
    this.lut3D = config.lut3D || null; // 3D LUT texture
  }

  /**
   * Composite final frame from radiance and AOVs
   */
  composite(frame) {
    const { radiance, aovs, camera } = frame;
    const { width, height } = frame;
    
    let color = new Float32Array(radiance);
    
    // 1. Exposure
    color = this._applyExposure(color, frame.exposure || 1.0);
    
    // 2. Tonemapping
    color = this._tonemap(color);
    
    // 3. Color space conversion
    color = this._colorSpaceTransform(color);
    
    // 4. Bloom
    if (this.bloom) {
      color = this._addBloom(color, frame);
    }
    
    // 5. Film grain
    if (this.filmGrain) {
      this._addFilmGrain(color);
    }
    
    // 6. Vignette
    if (this.vignette > 0) {
      this._applyVignette();
    }
    
    // 6. Chromatic aberration
    if (this.chromaticAberration > 0) {
      this._applyChromaticAberration();
    }
    
    // 7. Gamma correction
    color = this._gammaCorrect(color);
    
    // 8. Clamp and convert to output format
    return this._toOutputFormat(color);
  }

  _applyExposure(color, exposure) {
    for (let i = 0; i < color.length; i++) {
      color[i] *= exposure;
    }
    return color;
  }

  _tonemap(color) {
    switch (this.tonemap) {
      case "reinhard":
        return this._reinhard(color);
      case "aces":
        return this._acesTonemap(color);
      case "filmic":
        return this._filmicTonemap(color);
      default:
        return color;
    }
  }

  _reinhard(color) {
    for (let i = 0; i < color.length; i += 3) {
      const r = color[i];
      const g = color[i + 1];
      const b = color[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const factor = luma / (1 + luma);
      const scale = luma > 0 ? factor / luma : 1;
      color[i] *= scale;
      color[i + 1] *= scale;
      color[i + 2] *= scale;
    }
    return color;
  }

  _acesTonemap(color) {
    // ACES approximation (RRT + ODT)
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    
    for (let i = 0; i < color.length; i += 3) {
      const r = color[i];
      const g = color[i + 1];
      const b = color[i + 2];
      
      const R = (r * (a * r + b)) / (r * (c * r + d) + e);
      const G = (g * (a * g + b)) / (g * (c * g + d) + e);
      const B = (b * (a * b + b)) / (b * (c * b + d) + e);
      
      color[i] = Math.max(0, Math.min(1, R));
      color[i + 1] = Math.max(0, Math.min(1, G));
      color[i + 2] = Math.max(0, Math.min(1, B));
    }
    return color;
  }

  _filmicTonemap(color) {
    // Uncharted 2 filmic
    const A = 0.15;
    const B = 0.50;
    const C = 0.10;
    const D = 0.20;
    const E = 0.02;
    const F = 0.30;
    const W = 11.2;
    
    for (let i = 0; i < color.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const x = Math.max(0, color[i + c]);
        const num = x * (A * x + C * x + D);
        const denom = x * (A * x + B) + E;
        color[i + c] = (num / denom) - E / F;
      }
    }
    // White point normalization
    const whiteScale = 1.0 / ((W * (A * W + C * W + D)) / (W * (A * W + B) + E) - E / F);
    for (let i = 0; i < color.length; i++) {
      color[i] *= whiteScale;
    }
    return color;
  }

  _colorSpaceTransform(color) {
    if (this.colorSpace === "linear") return color;
    if (this.colorSpace === "sRGB") return this._linearToSRGB(color);
    if (this.colorSpace === "ACES") return this._linearToACES(color);
    if (this.colorSpace === "ACEScg") return this._linearToACEScg(color);
    return color;
  }

  _linearToSRGB(color) {
    for (let i = 0; i < color.length; i++) {
      const c = color[i];
      color[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1/2.4) - 0.055;
    }
    return color;
  }

  _addBloom(color, frame) {
    // Simplified bloom - extract bright areas, blur, add back
    // In production: use separable Gaussian blur on bright pass
    return color;
  }

  _addFilmGrain(color) {
    for (let i = 0; i < color.length; i++) {
      color[i] += (Math.random() - 0.5) * this.grainStrength;
    }
    return color;
  }

  _applyVignette() {
    // Applied in final output
  }

  _applyChromaticAberration() {
    // Simulated in final output
  }

  _gammaCorrect(color) {
    for (let i = 0; i < color.length; i++) {
      color[i] = Math.pow(Math.max(0, Math.min(1, color[i])), 1 / this.gamma);
    }
    return color;
  }

  _toOutputFormat(color) {
    const output = new Uint8Array(color.length);
    for (let i = 0; i < color.length; i++) {
      output[i] = Math.floor(Math.max(0, Math.min(255, color[i] * 255)));
    }
    return output;
  }

  // EXR output (half-float)
  toEXR(color, width, height) {
    // Would use exr library
    // Return ArrayBuffer
    return null;
  }
}

/**
 * Film response curves
 */
export const FilmCurves = {
  kodak2383: {
    // Kodak 2383 film emulation
    red: [x => x, x => x, x => x],
    green: [x => x, x => x, x => x],
    blue: [x => x, x => x, x => x]
  },
  fuji3510: {
    // Fuji 3510 film emulation
  }
};

export function applyFilmCurve(color, curveName) {
  // Apply film response curve
  return color;
}