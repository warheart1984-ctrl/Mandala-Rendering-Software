export { PBRMaterial } from "./PBRMaterial.js";
export { DisneyMaterial, createDisneyMaterial } from "./DisneyMaterial.js";
export { ConductorMaterial, createConductorMaterial } from "./ConductorMaterial.js";
export { GlassMaterial, createGlassMaterial } from "./GlassMaterial.js";
export { SubsurfaceMaterial, createSubsurfaceMaterial } from "./SubsurfaceMaterial.js";
export { ThinFilmMaterial, createThinFilmMaterial } from "./ThinFilmMaterial.js";
export { LayeredMaterial, createLayeredMaterial } from "./LayeredMaterial.js";
export { PhotorealUtils } from "./PhotorealUtils.js";

// Material registry
import { PBRMaterial } from "./PBRMaterial.js";
import { DisneyMaterial } from "./DisneyMaterial.js";
import { ConductorMaterial } from "./ConductorMaterial.js";
import { GlassMaterial } from "./GlassMaterial.js";
import { SubsurfaceMaterial } from "./SubsurfaceMaterial.js";
import { ThinFilmMaterial } from "./ThinFilmMaterial.js";
import { LayeredMaterial } from "./LayeredMaterial.js";

const MATERIAL_CLASSES = {
  pbr: PBRMaterial,
  disney: DisneyMaterial,
  conductor: ConductorMaterial,
  glass: GlassMaterial,
  subsurface: SubsurfaceMaterial,
  thinfilm: ThinFilmMaterial,
  layered: LayeredMaterial
};

export class MaterialRegistry {
  constructor() {
    this.materials = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    // Register common presets
    this.register("default", new PBRMaterial({ materialId: "default" }));
    this.register("gold", ConductorMaterial.createConductorMaterial({ preset: "gold" }));
    this.register("silver", ConductorMaterial.createConductorMaterial({ preset: "silver" }));
    this.register("copper", ConductorMaterial.createConductorMaterial({ preset: "copper" }));
    this.register("glass", new GlassMaterial({ ior: 1.5, roughness: 0 }));
    this.register("water", new GlassMaterial({ ior: 1.33, roughness: 0.01 }));
    this.register("skin", new SubsurfaceMaterial({ scatteringColor: [1, 0.8, 0.6], scatteringDistance: 5 }));
  }

  register(id, material) {
    this.materials.set(id, material);
    return material;
  }

  get(id) {
    return this.materials.get(id);
  }

  create(type, definition) {
    const MaterialClass = MATERIAL_CLASSES[type];
    if (!MaterialClass) {
      throw new Error(`Unknown material type: ${type}`);
    }
    const material = new MaterialClass(definition);
    if (definition.materialId) {
      this.register(definition.materialId, material);
    }
    return material;
  }

  has(id) {
    return this.materials.has(id);
  }

  list() {
    return Array.from(this.materials.keys());
  }
}

export const materialRegistry = new MaterialRegistry();

export function createMaterial(type, definition) {
  return materialRegistry.create(type, definition);
}

export function getMaterial(id) {
  return materialRegistry.get(id);
}

export function registerMaterial(id, material) {
  return materialRegistry.register(id, material);
}