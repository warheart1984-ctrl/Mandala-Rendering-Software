import { PBRMaterial } from "./PBRMaterial.js";

/**
 * Subsurface Scattering Material
 * Uses diffusion profile approximation (dipole or multi-pole)
 */
export class SubsurfaceMaterial extends PBRMaterial {
  constructor(definition = {}) {
    super({
      ...definition,
      type: "subsurface",
      metallic: 0.0,
      transmission: 1.0,
      // Subsurface parameters
      scatteringColor: definition.scatteringColor ?? [1.0, 0.8, 0.6], // warm skin
      scatteringDistance: definition.scatteringDistance ?? 5.0, // mean free path
      scatteringAnisotropy: definition.scatteringAnisotropy ?? 0.0, // Henyey-Greenstein g
      phase: definition.phase ?? 0.0,
      // Single scattering (optional)
      singleScatter: definition.singleScatter ?? false,
    });
  }

  _bsdf(wi, wo, normal, tangent, uv) {
    const ndotwi = Math.max(0, this._dot(normal, wi));
    const ndotwo = Math.max(0, this._dot(normal, wo));
    
    // Diffuse (surface)
    const surface = this._multiply(this.albedo, 1.0 / Math.PI);
    
    // Subsurface diffusion (dipole approximation)
    const ss = this._subsurfaceDiffusion(wi, wo, normal, tangent);
    
    // Combine
    const f = this._add(
      this._multiply(surface, 1.0 - this.transmission),
      this._multiply(ss, this.transmission)
    );
    
    const pdf = this._dot(normal, wo) / Math.PI;
    
    return { f, pdf };
  }

  _subsurfaceDiffusion(wi, wo, normal, tangent) {
    // Dipole approximation (Jensen et al. 2001)
    // R_d(r) = (alpha' / (4*pi)) * (z_r * (1 + sigma_tr * d_r) * exp(-sigma_tr * d_r) / d_r^3 + z_v * (1 + sigma_tr * d_v) * exp(-sigma_tr * d_v) / d_v^3)
    
    // For real-time, use simplified screen-space or pre-integrated
    // Here: simplified radial falloff
    const dist = Math.max(0.001, this._distance(wi, wo));
    const sigmaTr = 1.0 / this.scatteringDistance;
    const falloff = Math.exp(-sigmaTr * dist) / (dist * dist + 0.001);
    
    // Phase function (Henyey-Greenstein)
    const cosTheta = this._dot(wi, wo);
    const g = this.scatteringAnisotropy;
    const phase = (1.0 - g*g) / (4*Math.PI * Math.pow(1 + g*g - 2*g*cosTheta, 1.5));
    
    const color = this._multiply(this.scatteringColor, falloff * phase * 0.1);
    return color;
  }
}

export function createSubsurfaceMaterial(definition) {
  return new SubsurfaceMaterial(definition);
}