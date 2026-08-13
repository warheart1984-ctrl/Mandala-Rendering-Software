import { PBRMaterial } from "./PBRMaterial.js";

/**
 * Conductor (Metal) Material
 * Uses complex IOR (n + ik) for accurate metal rendering
 */
export class ConductorMaterial extends PBRMaterial {
  constructor(definition = {}) {
    super({
      ...definition,
      type: "conductor",
      metallic: 1.0,
      // Complex IOR: [n, k] for R, G, B
      ior: definition.ior ?? [0.17, 0.35, 1.5],      // n (real part)
      extinction: definition.extinction ?? [3.42, 2.37, 1.81], // k (imaginary part)
    });
    this.extinction = definition.extinction ?? [3.42, 2.37, 1.81];
  }

  _fresnelF0() {
    // For conductors, F0 is computed from complex IOR
    // F0 = |(n - 1 + ik) / (n + 1 + ik)|^2
    return this.extinction.map((kVal, i) => {
      const n = this.ior[i] ?? 1.0;
      const k = kVal;
      const num = (n - 1)*(n - 1) + k*k;
      const den = (n + 1)*(n + 1) + k*k;
      return num / den;
    });
  }

  _fresnelSchlick(cosTheta, F0) {
    // For conductors, use full Fresnel equations instead of Schlick
    // Simplified: use Schlick with conductor F0
    const c = 1.0 - Math.max(0, cosTheta);
    const c5 = c*c*c*c*c;
    return this._add(F0, this._multiply(this._sub([1,1,1], F0), c5));
  }
}

export function createConductorMaterial(definition) {
  // Presets for common metals
  const presets = {
    gold: { albedo: [1.0, 0.766, 0.336], roughness: 0.1, ior: [0.17, 0.35, 1.5], extinction: [3.42, 2.37, 1.81] },
    silver: { albedo: [0.97, 0.96, 0.91], roughness: 0.01, ior: [0.05, 0.05, 0.05], extinction: [5.0, 4.0, 3.0] },
    copper: { albedo: [0.95, 0.64, 0.54], roughness: 0.05, ior: [0.2, 0.8, 1.1], extinction: [3.5, 2.5, 2.0] },
    aluminum: { albedo: [0.91, 0.92, 0.92], roughness: 0.08, ior: [1.0, 1.0, 1.0], extinction: [7.0, 7.0, 7.0] },
    iron: { albedo: [0.56, 0.57, 0.58], roughness: 0.2, ior: [2.0, 2.5, 3.0], extinction: [3.0, 3.5, 4.0] },
  };
  
  if (definition.preset && presets[definition.preset]) {
    definition = { ...presets[definition.preset], ...definition };
  }
  
  return new ConductorMaterial(definition);
}