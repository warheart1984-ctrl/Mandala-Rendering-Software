import { PhotorealRNG, V3, fresnelSchlick, fresnelConductor, ggxNDF, smithGGX } from "../material/PhotorealUtils.js";

/**
 * Hosek-Wilkie Sky Model
 * Analytic sky radiance model for realistic outdoor lighting
 */
export class HosekWilkieSky {
  constructor(params = {}) {
    this.turbidity = params.turbidity ?? 3.0;
    this.sunElevation = params.sunElevation ?? 0.5; // radians
    this.groundAlbedo = params.groundAlbedo ?? 0.3;
    this.sunDirection = params.sunDirection ?? [0, 1, 0];
  }

  setSunDirection(dir) {
    this.sunDirection = V3.normalize(dir);
    this.sunElevation = Math.asin(Math.max(-1, Math.min(1, this.sunDirection[1])));
  }

  evaluate(wi) {
    // Hosek-Wilkie sky radiance
    // Simplified version - full implementation uses precomputed coefficients
    const cosSun = Math.max(0, V3.dot(wi, this.sunDirection));
    const sunAngle = Math.acos(Math.max(-1, Math.min(1, cosSun)));
    
    // Mie scattering (sun glow)
    const mie = Math.exp(-sunAngle * 10) * 1000;
    
    // Rayleigh scattering (blue sky)
    const rayleigh = Math.max(0, 0.5 + 0.5 * wi[1]) * (1 + 0.5 * this.turbidity);
    
    // Horizon glow
    const horizon = Math.max(0, 1 + wi[1]) * (1 + this.turbidity * 0.5);
    
    return [
      (rayleigh * 0.6 + horizon * 0.4 + mie) * 0.5,
      (rayleigh * 0.8 + horizon * 0.3 + mie) * 0.5,
      (rayleigh * 1.0 + horizon * 0.2 + mie) * 0.5
    ];
  }

  sample(rng) {
    // Importance sample sky - bias toward sun
    if (rng.nextFloat() < 0.1) {
      // Sample near sun
      const theta = Math.acos(1 - rng.nextFloat() * 0.01);
      const phi = rng.nextFloat() * 2 * Math.PI;
      const dir = [
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi)
      ];
      return { dir, pdf: 100 };
    }
    // Uniform hemisphere with cosine weighting
    const u1 = Math.random();
    const u2 = Math.random();
    const r = Math.sqrt(u1);
    const theta = 2 * Math.PI * u2;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = Math.sqrt(Math.max(0, 1 - u1));
    return { dir: [x, y, z], pdf: 1 / Math.PI };
  }
}

/**
 * Preetham Sky Model (simpler alternative)
 */
export class PreethamSky {
  constructor(params = {}) {
    this.turbidity = params.turbidity ?? 2.0;
    this.sunDirection = params.sunDirection ?? [0, 1, 0];
  }

  evaluate(wi) {
    // Preetham et al. 1999 sky model
    // Simplified implementation
    const cosSun = Math.max(0, V3.dot(wi, this.sunDirection));
    const thetaS = Math.acos(Math.max(-1, Math.min(1, cosSun)));
    
    const A = 0.91 + 0.91 * this.turbidity;
    const B = -0.36 - 0.06 * this.turbidity;
    const C = 1.1 - 0.09 * this.turbidity;
    const D = 0.18 + 0.82 * this.turbidity;
    const E = -0.28 - 0.06 * this.turbidity;
    const F = 1.16 - 1.22 * this.turbidity;
    const G = 0.02 + 0.02 * this.turbidity;
    const H = 0.5 + 0.5 * this.turbidity;
    const I = 0.06 - 0.06 * this.turbidity;
    
    const chi = Math.acos(Math.max(-1, Math.min(1, wi[1])));
    const gamma = Math.acos(Math.max(-1, Math.min(1, V3.dot(wi, this.sunDirection))));
    
    const skyLuminance = (A + B * Math.exp(C / Math.max(0.001, Math.cos(chi)))) * 
                         (D + E * Math.exp(F * gamma) + G * Math.cos(gamma) * Math.cos(gamma)) + 
                         H * Math.cos(chi) + I;
    
    const val = Math.max(0, skyLuminance);
    return [val, val * 1.1, val * 1.2];
  }
}

export { V3 };