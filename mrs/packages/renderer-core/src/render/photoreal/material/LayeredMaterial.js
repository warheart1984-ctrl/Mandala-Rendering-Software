import { PBRMaterial } from "./PBRMaterial.js";
import { DisneyMaterial } from "./DisneyMaterial.js";
import { ConductorMaterial } from "./ConductorMaterial.js";
import { GlassMaterial } from "./GlassMaterial.js";
import { SubsurfaceMaterial } from "./SubsurfaceMaterial.js";
import { ThinFilmMaterial } from "./ThinFilmMaterial.js";

/**
 * Layered Material
 * Combines multiple material layers with blending (e.g., paint on metal, clearcoat on base, etc.)
 */
export class LayeredMaterial {
  constructor(definition = {}) {
    this.layers = (definition.layers || []).map(layerDef => {
      const MaterialClass = this._getMaterialClass(layerDef.type);
      return {
        material: new (MaterialClass || PBRMaterial)(layerDef),
        weight: layerDef.weight ?? 1.0,
        blendMode: layerDef.blendMode || "mix", // "mix", "add", "multiply", "screen", "overlay"
        mask: layerDef.mask // optional texture/mask for blending
      };
    });
    
    this.base = definition.base ? new PBRMaterial(definition.base) : new PBRMaterial({});
    this.materialId = definition.materialId ?? `layered_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.type = "layered";
  }

  _getMaterialClass(type) {
    switch (type) {
      case "pbr": return PBRMaterial;
      case "disney": return DisneyMaterial;
      case "conductor": return ConductorMaterial;
      case "glass": return GlassMaterial;
      case "subsurface": return SubsurfaceMaterial;
      case "thinfilm": return ThinFilmMaterial;
      default: return PBRMaterial;
    }
  }

  evaluate(wi, wo, normal, tangent, uv) {
    let result = { f: [0, 0, 0], pdf: 0 };
    let totalWeight = 0;
    
    for (const layer of this.layers) {
      const layerResult = layer.material.evaluate(wi, wo, normal, tangent, uv);
      const weight = layer.weight;
      
      if (layer.blendMode === "add") {
        result.f[0] += layerResult.f[0] * weight;
        result.f[1] += layerResult.f[1] * weight;
        result.f[2] += layerResult.f[2] * weight;
      } else if (layer.blendMode === "multiply") {
        result.f[0] *= 1 + (layerResult.f[0] - 1) * weight;
        result.f[1] *= 1 + (layerResult.f[1] - 1) * weight;
        result.f[2] *= layerResult.f[2] * weight;
      } else {
        // Default mix
        result.f[0] = result.f[0] * (1 - weight) + layerResult.f[0] * weight;
        result.f[1] = result.f[1] * (1 - weight) + layerResult.f[1] * weight;
        result.f[2] = result.f[2] * (1 - weight) + layerResult.f[2] * weight;
      }
      result.pdf = Math.max(result.pdf, layerResult.pdf);
      totalWeight += weight;
    }
    
    // Normalize if weights don't sum to 1
    if (totalWeight > 0 && totalWeight !== 1) {
      result.f[0] /= totalWeight;
      result.f[1] /= totalWeight;
      result.f[2] /= totalWeight;
    }
    
    // Add base material
    const baseResult = this.base.evaluate(wi, wo, normal, tangent, uv);
    result.f[0] = result.f[0] * 0.5 + baseResult.f[0] * 0.5;
    result.f[1] = result.f[1] * 0.5 + baseResult.f[1] * 0.5;
    result.f[2] = result.f[2] * 0.5 + baseResult.f[2] * 0.5;
    result.pdf = Math.max(result.pdf, baseResult.pdf);
    
    return { f: result.f, pdf: result.pdf };
  }

  sample(wo, normal, tangent, uv, rng) {
    // Sample from the dominant layer or base
    const dominantLayer = this.layers.reduce((max, l) => l.weight > max.weight ? l : max, this.layers[0]);
    return dominantLayer.material.sample(wo, normal, tangent, uv, rng);
  }

  pdf(wi, wo, normal, tangent, uv) {
    // Return max PDF across layers
    return Math.max(...this.layers.map(l => l.material.pdf(wi, wo, normal, tangent, uv)));
  }
}

export function createLayeredMaterial(definition) {
  return new LayeredMaterial(definition);
}