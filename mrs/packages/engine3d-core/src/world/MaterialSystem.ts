import type { MaterialType, TextureAsset, TextureRef, UniversalMaterial, Vec3Tuple } from "./WorldObject.js";
import { createUniversalMaterial } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";
import { validateTextureRefs } from "./TextureSystem.js";

export const UNIVERSAL_MATERIAL_TYPES: readonly MaterialType[] = Object.freeze([
  "basic",
  "metal",
  "glass",
  "emissive",
  "skin",
  "hair",
  "cloth",
  "plastic",
  "wood",
  "stone",
  "neon-grid",
  "mandala-core",
  "tesseract-surface",
  "sovereign-glyph",
  "energy-lattice",
]);

export interface MaterialValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface MaterialValidationResult {
  readonly ok: boolean;
  readonly issues: readonly MaterialValidationIssue[];
}

export interface Rt4dMaterialEntry {
  readonly id: string;
  readonly kind: MaterialType;
  readonly params: {
    readonly baseColor: Vec3Tuple;
    readonly roughness: number;
    readonly metallic: number;
    readonly emissive: Vec3Tuple;
    readonly textureRefs: readonly TextureRef[];
    readonly brdf: "lambertian" | "ggx" | "dielectric" | "emissive" | "skin" | "hair" | "cloth" | "procedural";
    readonly anisotropy?: number;
    readonly subsurface?: number;
    readonly transmission?: number;
    readonly proceduralPalette?: string;
  };
}

function issue(code: string, message: string, path?: string): MaterialValidationIssue {
  return { code, message, path };
}

function finite01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validColor(color: readonly number[]): color is Vec3Tuple {
  return color.length === 3 && color.every((value) => Number.isFinite(value));
}

export function validateUniversalMaterials(materials: readonly UniversalMaterial[], textures?: readonly TextureAsset[]): MaterialValidationResult {
  const issues: MaterialValidationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, material] of materials.entries()) {
    const path = `materials.${index}`;
    if (!material.id) issues.push(issue("missing-material-id", "Material requires stable id.", `${path}.id`));
    if (ids.has(material.id)) issues.push(issue("duplicate-material-id", `Duplicate material id ${material.id}.`, `${path}.id`));
    ids.add(material.id);
    if (!UNIVERSAL_MATERIAL_TYPES.includes(material.type)) issues.push(issue("unsupported-material-type", `Unsupported material type ${material.type}.`, `${path}.type`));
    if (!validColor(material.baseColor)) issues.push(issue("invalid-base-color", "baseColor must be three finite numbers.", `${path}.baseColor`));
    if (!validColor(material.emissive)) issues.push(issue("invalid-emissive", "emissive must be three finite numbers.", `${path}.emissive`));
    if (!finite01(material.roughness)) issues.push(issue("invalid-roughness", "roughness must be finite and within [0,1].", `${path}.roughness`));
    if (!finite01(material.metallic)) issues.push(issue("invalid-metallic", "metallic must be finite and within [0,1].", `${path}.metallic`));
    const textureIds = new Set<string>();
    for (const [textureIndex, texture] of material.textureRefs.entries()) {
      if (!texture.id) issues.push(issue("missing-texture-id", "TextureRef requires id.", `${path}.textureRefs.${textureIndex}.id`));
      const textureKey = `${texture.role}:${texture.id}`;
      if (textureIds.has(textureKey)) issues.push(issue("duplicate-texture-ref", `Duplicate texture ref ${textureKey}.`, `${path}.textureRefs.${textureIndex}`));
      textureIds.add(textureKey);
    }
    if (textures) {
      const textureResult = validateTextureRefs(material.textureRefs, textures);
      for (const textureIssue of textureResult.issues) {
        issues.push(issue(textureIssue.code, textureIssue.message, `${path}.${textureIssue.path ?? "textureRefs"}`));
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeColor(color: readonly number[] | undefined, fallback: Vec3Tuple): Vec3Tuple {
  if (!color || color.length !== 3) return fallback;
  const [r, g, b] = color;
  return [
    Number.isFinite(r) ? r! : fallback[0],
    Number.isFinite(g) ? g! : fallback[1],
    Number.isFinite(b) ? b! : fallback[2],
  ];
}

export function normalizeUniversalMaterial(material: Partial<UniversalMaterial> & Pick<UniversalMaterial, "id" | "type">): UniversalMaterial {
  const base = createUniversalMaterial(material);
  return {
    ...base,
    baseColor: normalizeColor(base.baseColor, [0.8, 0.8, 0.8]),
    roughness: clamp01(base.roughness),
    metallic: clamp01(base.metallic),
    emissive: normalizeColor(base.emissive, [0, 0, 0]),
    textureRefs: [...base.textureRefs].sort((a, b) => `${a.role}:${a.id}`.localeCompare(`${b.role}:${b.id}`)),
  };
}

function brdfForMaterial(type: MaterialType): Rt4dMaterialEntry["params"]["brdf"] {
  if (type === "metal") return "ggx";
  if (type === "glass") return "dielectric";
  if (type === "emissive") return "emissive";
  if (type === "skin") return "skin";
  if (type === "hair") return "hair";
  if (type === "cloth") return "cloth";
  if (type === "neon-grid" || type === "mandala-core" || type === "tesseract-surface" || type === "sovereign-glyph" || type === "energy-lattice") return "procedural";
  return "lambertian";
}

export function materialToRt4dEntry(material: UniversalMaterial): Rt4dMaterialEntry {
  const normalized = normalizeUniversalMaterial(material);
  const procedural = brdfForMaterial(normalized.type) === "procedural";
  return {
    id: normalized.id,
    kind: normalized.type,
    params: {
      baseColor: normalized.baseColor,
      roughness: normalized.roughness,
      metallic: normalized.metallic,
      emissive: normalized.emissive,
      textureRefs: normalized.textureRefs,
      brdf: brdfForMaterial(normalized.type),
      ...(normalized.type === "skin" ? { subsurface: 0.35 } : {}),
      ...(normalized.type === "hair" ? { anisotropy: 0.8 } : {}),
      ...(normalized.type === "cloth" ? { anisotropy: 0.35 } : {}),
      ...(normalized.type === "glass" ? { transmission: 1 } : {}),
      ...(procedural ? { proceduralPalette: normalized.type } : {}),
    },
  };
}

export function buildRt4dMaterialTable(materials: readonly UniversalMaterial[]): readonly Rt4dMaterialEntry[] {
  return materials.map(materialToRt4dEntry).sort((a, b) => a.id.localeCompare(b.id));
}

export function hashMaterialTable(materials: readonly UniversalMaterial[]): string {
  return hashCanonical(buildRt4dMaterialTable(materials));
}
