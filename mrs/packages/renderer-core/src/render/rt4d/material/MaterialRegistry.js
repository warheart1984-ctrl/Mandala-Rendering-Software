import { vec4 } from "../math/vec4.js";

export const MATERIAL_KINDS = Object.freeze([
  "basic",
  "skin",
  "hair",
  "cloth",
  "metal",
  "glass",
  "emissive",
  "plastic",
  "wood",
  "stone",
  "neon-grid",
  "mandala-core",
  "tesseract-surface",
  "sovereign-glyph",
  "energy-lattice",
]);

const DEFAULT_ENTRY = Object.freeze({
  id: "default",
  kind: "basic",
  params: {
    baseColor: [0.8, 0.8, 0.8],
    roughness: 0.7,
    metallic: 0,
    emissive: [0, 0, 0],
    textureRefs: [],
  },
});

const BRDF_BY_KIND = Object.freeze({
  basic: "lambertian",
  plastic: "lambertian",
  wood: "lambertian",
  stone: "lambertian",
  metal: "ggx",
  glass: "dielectric",
  emissive: "emissive",
  skin: "skin",
  hair: "hair",
  cloth: "cloth",
  "neon-grid": "procedural",
  "mandala-core": "procedural",
  "tesseract-surface": "procedural",
  "sovereign-glyph": "procedural",
  "energy-lattice": "procedural",
});

function normalizeColor(color, fallback) {
  const c = Array.isArray(color) ? color : fallback;
  return [Number(c[0] ?? fallback[0]), Number(c[1] ?? fallback[1]), Number(c[2] ?? fallback[2])];
}

export function normalizeMaterialEntry(entry) {
  if (!entry?.id) throw new Error("MaterialRegistry.register requires entry.id");
  const kind = MATERIAL_KINDS.includes(entry.kind) ? entry.kind : "basic";
  const params = entry.params ?? {};
  return {
    id: String(entry.id),
    kind,
    params: {
      ...params,
      baseColor: normalizeColor(params.baseColor, DEFAULT_ENTRY.params.baseColor),
      roughness: Number.isFinite(params.roughness) ? params.roughness : DEFAULT_ENTRY.params.roughness,
      metallic: Number.isFinite(params.metallic) ? params.metallic : DEFAULT_ENTRY.params.metallic,
      emissive: normalizeColor(params.emissive, DEFAULT_ENTRY.params.emissive),
      textureRefs: Array.isArray(params.textureRefs) ? params.textureRefs.slice() : [],
      brdf: params.brdf ?? BRDF_BY_KIND[kind] ?? "lambertian",
      ...(kind === "skin" ? { subsurface: Number.isFinite(params.subsurface) ? params.subsurface : 0.35 } : {}),
      ...(kind === "hair" ? { anisotropy: Number.isFinite(params.anisotropy) ? params.anisotropy : 0.8 } : {}),
      ...(kind === "cloth" ? { anisotropy: Number.isFinite(params.anisotropy) ? params.anisotropy : 0.35 } : {}),
      ...(kind === "glass" ? { transmission: Number.isFinite(params.transmission) ? params.transmission : 1 } : {}),
      ...(BRDF_BY_KIND[kind] === "procedural" ? { proceduralPalette: params.proceduralPalette ?? kind } : {}),
    },
  };
}

export function rt4dMaterialToLegacyParams(entry) {
  const material = normalizeMaterialEntry(entry);
  const base = material.params.baseColor;
  const emissive = material.params.emissive;
  if (material.kind === "emissive") {
    return {
      id: material.id,
      type: "light",
      params: { albedo: vec4(base[0], base[1], base[2], 1), emission: vec4(emissive[0], emissive[1], emissive[2], 1), textureRefs: material.params.textureRefs },
    };
  }
  if (material.kind === "metal" || material.kind === "glass") {
    return {
      id: material.id,
      type: "ggx",
      params: {
        albedo: vec4(base[0], base[1], base[2], 1),
        roughness: Math.max(0.02, material.params.roughness),
        f0: vec4(material.kind === "metal" ? 0.9 : 0.04, material.kind === "metal" ? 0.9 : 0.04, material.kind === "metal" ? 0.9 : 0.04, 1),
        transmission: material.kind === "glass" ? material.params.transmission ?? 1 : 0,
        textureRefs: material.params.textureRefs,
      },
    };
  }
  if (material.kind === "skin") {
    return {
      id: material.id,
      type: "skin",
      params: { albedo: vec4(base[0], base[1], base[2], 1), roughness: material.params.roughness, subsurface: material.params.subsurface ?? 0.35, textureRefs: material.params.textureRefs },
    };
  }
  if (material.kind === "hair" || material.kind === "cloth") {
    return {
      id: material.id,
      type: material.kind,
      params: { albedo: vec4(base[0], base[1], base[2], 1), roughness: material.params.roughness, anisotropy: material.params.anisotropy ?? (material.kind === "hair" ? 0.8 : 0.35), textureRefs: material.params.textureRefs },
    };
  }
  if (material.params.brdf === "procedural") {
    return {
      id: material.id,
      type: "procedural",
      params: { albedo: vec4(base[0], base[1], base[2], 1), palette: material.params.proceduralPalette ?? material.kind, emission: vec4(emissive[0], emissive[1], emissive[2], 1), textureRefs: material.params.textureRefs },
    };
  }
  return {
    id: material.id,
    type: "lambertian",
    params: { albedo: vec4(base[0], base[1], base[2], 1), textureRefs: material.params.textureRefs },
  };
}

export class MaterialRegistry {
  constructor(entries = []) {
    this.table = new Map();
    this.register(DEFAULT_ENTRY);
    for (const entry of entries) this.register(entry);
  }

  register(entry) {
    const normalized = normalizeMaterialEntry(entry);
    this.table.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.table.get(id) ?? this.table.get("default");
  }

  has(id) {
    return this.table.has(id);
  }

  entries() {
    return Array.from(this.table.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  toLegacyMaterialSystem(materialSystem) {
    for (const entry of this.entries()) {
      const legacy = rt4dMaterialToLegacyParams(entry);
      materialSystem.createMaterial(legacy.id, legacy.type, legacy.params);
    }
    return materialSystem;
  }
}
