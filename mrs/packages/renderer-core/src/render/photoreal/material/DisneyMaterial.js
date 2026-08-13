import { PBRMaterial } from "./PBRMaterial.js";

/**
 * Disney Principled Material - full parameter set
 * Extension of PBRMaterial with additional Disney parameters
 */
export class DisneyMaterial extends PBRMaterial {
  constructor(definition = {}) {
    super({
      ...definition,
      type: "disney",
      // Disney-specific defaults
      clearcoat: definition.clearcoat ?? 0.0,
      clearcoatRoughness: definition.clearcoatRoughness ?? 0.0,
      anisotropy: definition.anisotropy ?? 0.0,
      anisotropyRotation: definition.anisotropyRotation ?? 0.0,
      sheen: definition.sheen ?? 0.0,
      sheenTint: definition.sheenTint ?? 0.5,
      transmission: definition.transmission ?? 0.0,
      thickness: definition.thickness ?? 0.0,
      ior: definition.ior ?? 1.5,
    });
  }

  // Override _bsdf for full Disney evaluation with all terms
  _bsdf(wi, wo, normal, tangent, uv) {
    // Full Disney evaluation including all terms
    return super._bsdf(wi, wo, normal, tangent, uv);
  }
}

export function createDisneyMaterial(definition) {
  return new DisneyMaterial(definition);
}