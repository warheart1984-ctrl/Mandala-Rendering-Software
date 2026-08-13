import { PBRMaterial } from "./PBRMaterial.js";

/**
 * Glass / Dielectric Material
 * Transmission + reflection with Fresnel
 */
export class GlassMaterial extends PBRMaterial {
  constructor(definition = {}) {
    super({
      ...definition,
      type: "glass",
      metallic: 0.0,
      transmission: definition.transmission ?? 1.0,
      ior: definition.ior ?? 1.5,
      roughness: definition.roughness ?? 0.0,
      thickness: definition.thickness ?? 1.0,
    });
  }

  _bsdf(wi, wo, normal, tangent, uv) {
    const ndotwi = this._dot(normal, wi);
    const ndotwo = Math.max(0, this._dot(normal, wo));
    
    // Entering or exiting
    const entering = ndotwi > 0;
    const eta = entering ? (1.0 / this.ior) : this.ior;
    
    // Fresnel
    const cosTheta = entering ? this._dot(normal, wi) : this._dot(normal, wo);
    const F = this._fresnelDielectric(cosTheta, this.ior);
    
    // Reflection
    const reflect = this._reflect(wi, normal);
    const ndotwr = Math.max(0, this._dot(normal, reflect));
    
    // Refraction (Snell's law)
    const sinThetaT2 = (1.0 - (1.0/this.ior)*(1.0/this.ior)) * (1.0 - ndotwo*ndotwo);
    let refract = null;
    if (sinThetaT2 <= 1.0) {
      const cosThetaT = Math.sqrt(1.0 - sinThetaT2);
      refract = this._refract(wi, normal, this.ior);
    }
    
    // Reflection component
    const Fr = F;
    const reflColor = [F, F, F];
    
    // Transmission component
    let transColor = [0, 0, 0];
    if (refract) {
      const Ft = 1.0 - F;
      const scale = (1.0/this.ior) * (1.0/this.ior);
      transColor = [Ft * scale, Ft * scale, Ft * scale];
    }
    
    // Combine
    const f = this._add(
      this._multiply(reflColor, 1.0 - this.transmission),
      this._multiply(transColor, this.transmission)
    );
    
    // PDF
    const pdf = F * (this._dot(normal, wo) / Math.PI) + (1-F) * Math.max(0, this._dot(normal, refract||[0,0,1])) / Math.PI;
    
    return { f, pdf };
  }

  _fresnelDielectric(cosTheta, ior) {
    const r0 = ((1.0 - ior) / (1.0 + ior)) ** 2;
    const c = 1.0 - Math.abs(cosTheta);
    return r0 + (1.0 - r0) * Math.pow(c, 5);
  }

  _reflect(v, n) {
    const dot = this._dot(v, n);
    return [
      v[0] - 2 * dot * n[0],
      v[1] - 2 * dot * n[1],
      v[2] - 2 * dot * n[2]
    ];
  }

  _refract(v, n, eta) {
    const dot = this._dot(v, n);
    const k = 1.0 - eta * eta * (1.0 - dot * dot);
    if (k < 0) return null;
    return [
      eta * v[0] - (eta * dot + Math.sqrt(Math.max(0, k))) * n[0],
      eta * v[1] - (eta * dot + Math.sqrt(Math.max(0, k))) * n[1],
      eta * v[2] - (eta * dot + Math.sqrt(Math.max(0, k))) * n[2]
    ];
  }
}

export function createGlassMaterial(definition) {
  return new GlassMaterial(definition);
}