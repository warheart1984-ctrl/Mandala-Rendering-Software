import { PBRMaterial } from "./PBRMaterial.js";

/**
 * Thin Film Material
 * Interference effects on thin layers (soap bubbles, oil slicks, coatings)
 */
export class ThinFilmMaterial extends PBRMaterial {
  constructor(definition = {}) {
    super({
      ...definition,
      type: "thinfilm",
      metallic: 0.0,
      transmission: 1.0,
      // Thin film parameters
      thickness: definition.thickness ?? 300.0, // nanometers
      ior: definition.ior ?? 1.33, // film IOR
      baseIor: definition.baseIor ?? 1.5, // substrate IOR
      thicknessVariation: definition.thicknessVariation ?? 0.0, // for iridescence variation
    });
  }

  _bsdf(wi, wo, normal, tangent, uv) {
    const ndotwo = Math.max(0, this._dot(normal, wo));
    const ndotwi = Math.max(0, this._dot(normal, wi));
    
    // Thin film interference
    // Phase difference: 2 * pi * 2 * n * d * cos(theta_t) / lambda
    // For RGB: compute per wavelength
    
    const cosThetaT = Math.sqrt(Math.max(0, 1 - (1 - this._dot(normal, wo)**2) / (this.ior * this.ior)));
    const opticalPath = 2 * this.ior * this.thickness * cosThetaT;
    
    // Per-wavelength interference
    const wavelengths = [650, 550, 450]; // R, G, B in nm
    const reflectance = wavelengths.map(lambda => {
      const phase = 2 * Math.PI * opticalPath / (lambda * 1e-9);
      const r0 = ((this.ior - 1) / (this.ior + 1)) ** 2;
      const r = 4 * r0 * Math.sin(phase / 2) ** 2;
      return r0 + (1 - r0) * r; // simplified
    });
    
    // Fresnel for base substrate
    const cosTheta = this._dot(normal, wo);
    const F_base = this._fresnelSchlick(cosTheta, [0.04, 0.04, 0.04]);
    
    // Combine film + substrate
    const F_film = this._multiply(reflectance, [1,1,1]);
    const F_total = this._add(F_film, this._multiply(F_base, this._sub([1,1,1], F_film)));
    
    const f = this._multiply(F_total, 1.0 / (4.0 * Math.max(0.001, this._dot(normal, wo))));
    const pdf = this._dot(normal, wo) / Math.PI;
    
    return { f, pdf };
  }

  _fresnelSchlick(cosTheta, F0) {
    const c = 1.0 - Math.max(0, cosTheta);
    const c5 = Math.pow(c, 5);
    return this._add(F0, this._multiply(this._sub([1,1,1], F0), c5));
  }
}

export function createThinFilmMaterial(definition) {
  return new ThinFilmMaterial(definition);
}