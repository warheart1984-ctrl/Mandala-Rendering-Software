/**
 * ShaderBridge — constitutional material descriptors → PBR params for soft-raster.
 *
 * Drive-G-1: This is a **partial** translation layer between Engine3D /
 * constitutional material semantics and soft-raster / UniversalMaterial PBR
 * fields (albedo, roughness, metallic). It does **not** enforce photoreal
 * shading, Cycles, or RTX. Soft-raster remains an approximation.
 *
 * Status: **partial**
 */

import type { MaterialType, UniversalMaterial, Vec3Tuple } from "../../world/WorldObject.js";
import { createUniversalMaterial } from "../../world/WorldObject.js";
import { normalizeUniversalMaterial } from "../../world/MaterialSystem.js";
import {
  rasterMaterialFromUniversal,
  type RasterMaterial,
} from "./RasterMaterial.js";

/** Constitutional / semantic material descriptor (evidence-bearing, not a crypto cert). */
export interface ConstitutionalMaterialDescriptor {
  readonly id: string;
  /** MaterialType or loose semantic string mapped by the bridge. */
  readonly type?: MaterialType | string;
  readonly semantic?: string;
  readonly baseColor?: Vec3Tuple | readonly number[];
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissive?: Vec3Tuple | readonly number[];
  /** Optional governance evidence fields (intent/world) — not cryptographic. */
  readonly intentId?: string;
  readonly worldId?: string;
  readonly evidenceIds?: readonly string[];
}

export interface PbrParams {
  readonly albedo: Vec3Tuple;
  readonly roughness: number;
  readonly metallic: number;
  readonly emissive: Vec3Tuple;
  readonly materialType: MaterialType;
  readonly transmission: number;
  readonly subsurface: number;
  readonly anisotropy: number;
}

export interface ShaderBridgeResult {
  readonly pbr: PbrParams;
  readonly universal: UniversalMaterial;
  readonly raster: RasterMaterial;
  readonly status: "partial";
  readonly notes: readonly string[];
}

const SEMANTIC_ALIASES: Record<string, MaterialType> = {
  albedo: "basic",
  diffuse: "basic",
  lambert: "basic",
  pbr: "plastic",
  chrome: "metal",
  steel: "metal",
  gold: "metal",
  dielectric: "glass",
  transparent: "glass",
  glow: "emissive",
  light: "emissive",
  flesh: "skin",
  human: "skin",
  fabric: "cloth",
  textile: "cloth",
  timber: "wood",
  rock: "stone",
  concrete: "stone",
  neon: "neon-grid",
  mandala: "mandala-core",
  tesseract: "tesseract-surface",
  glyph: "sovereign-glyph",
  lattice: "energy-lattice",
};

const TYPE_DEFAULTS: Record<
  MaterialType,
  { albedo: Vec3Tuple; roughness: number; metallic: number; emissive: Vec3Tuple }
> = {
  basic: { albedo: [0.75, 0.75, 0.75], roughness: 0.7, metallic: 0, emissive: [0, 0, 0] },
  metal: { albedo: [0.72, 0.72, 0.74], roughness: 0.25, metallic: 1, emissive: [0, 0, 0] },
  glass: { albedo: [0.85, 0.92, 0.95], roughness: 0.05, metallic: 0, emissive: [0, 0, 0] },
  emissive: { albedo: [0.1, 0.1, 0.1], roughness: 0.5, metallic: 0, emissive: [1.2, 0.9, 0.4] },
  skin: { albedo: [0.78, 0.55, 0.45], roughness: 0.55, metallic: 0, emissive: [0, 0, 0] },
  hair: { albedo: [0.18, 0.1, 0.06], roughness: 0.45, metallic: 0, emissive: [0, 0, 0] },
  cloth: { albedo: [0.35, 0.38, 0.55], roughness: 0.8, metallic: 0, emissive: [0, 0, 0] },
  plastic: { albedo: [0.65, 0.65, 0.68], roughness: 0.4, metallic: 0.05, emissive: [0, 0, 0] },
  wood: { albedo: [0.45, 0.3, 0.18], roughness: 0.75, metallic: 0, emissive: [0, 0, 0] },
  stone: { albedo: [0.55, 0.55, 0.52], roughness: 0.85, metallic: 0, emissive: [0, 0, 0] },
  "neon-grid": { albedo: [0.15, 0.95, 0.55], roughness: 0.35, metallic: 0.2, emissive: [0.05, 0.35, 0.2] },
  "mandala-core": { albedo: [0.85, 0.35, 1.0], roughness: 0.4, metallic: 0.15, emissive: [0.15, 0.05, 0.25] },
  "tesseract-surface": { albedo: [0.25, 0.75, 1.0], roughness: 0.3, metallic: 0.35, emissive: [0.05, 0.15, 0.3] },
  "sovereign-glyph": { albedo: [0.95, 0.85, 0.35], roughness: 0.35, metallic: 0.45, emissive: [0.2, 0.15, 0.05] },
  "energy-lattice": { albedo: [0.2, 0.55, 1.0], roughness: 0.4, metallic: 0.25, emissive: [0.05, 0.15, 0.4] },
};

function clamp01(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function asColor(c: readonly number[] | undefined, fallback: Vec3Tuple): Vec3Tuple {
  if (!c || c.length < 3) return fallback;
  return [
    Number.isFinite(c[0]) ? c[0]! : fallback[0],
    Number.isFinite(c[1]) ? c[1]! : fallback[1],
    Number.isFinite(c[2]) ? c[2]! : fallback[2],
  ];
}

export function resolveMaterialType(
  typeOrSemantic: string | undefined,
): MaterialType {
  if (!typeOrSemantic) return "basic";
  const raw = String(typeOrSemantic).trim().toLowerCase();
  if ((TYPE_DEFAULTS as Record<string, unknown>)[raw]) return raw as MaterialType;
  if (SEMANTIC_ALIASES[raw]) return SEMANTIC_ALIASES[raw]!;
  return "basic";
}

/**
 * Convert a constitutional / semantic descriptor into PBR params.
 * Status: **partial** — deterministic defaults + overrides; not a full BSDF.
 */
export function constitutionalToPbr(
  desc: ConstitutionalMaterialDescriptor,
): PbrParams {
  const materialType = resolveMaterialType(desc.type ?? desc.semantic);
  const defaults = TYPE_DEFAULTS[materialType];
  const albedo = asColor(desc.baseColor, defaults.albedo);
  const emissive = asColor(desc.emissive, defaults.emissive);
  const roughness =
    desc.roughness !== undefined ? clamp01(desc.roughness, defaults.roughness) : defaults.roughness;
  const metallic =
    desc.metallic !== undefined ? clamp01(desc.metallic, defaults.metallic) : defaults.metallic;

  return {
    albedo,
    roughness,
    metallic,
    emissive,
    materialType,
    transmission: materialType === "glass" ? 1 : 0,
    subsurface: materialType === "skin" ? 0.35 : 0,
    anisotropy:
      materialType === "hair" ? 0.8 : materialType === "cloth" ? 0.35 : 0,
  };
}

export function pbrToUniversalMaterial(
  id: string,
  pbr: PbrParams,
): UniversalMaterial {
  return normalizeUniversalMaterial(
    createUniversalMaterial({
      id,
      type: pbr.materialType,
      baseColor: pbr.albedo,
      roughness: pbr.roughness,
      metallic: pbr.metallic,
      emissive: pbr.emissive,
      textureRefs: [],
    }),
  );
}

/**
 * Full bridge: descriptor → PBR → UniversalMaterial → RasterMaterial.
 */
export function bridgeConstitutionalMaterial(
  desc: ConstitutionalMaterialDescriptor,
): ShaderBridgeResult {
  const pbr = constitutionalToPbr(desc);
  const universal = pbrToUniversalMaterial(desc.id, pbr);
  const raster = rasterMaterialFromUniversal(universal);
  const notes: string[] = [
    "shader-bridge status=partial — soft-raster PBR approx, not photoreal",
  ];
  if (desc.intentId) notes.push(`intentId=${desc.intentId}`);
  if (desc.worldId) notes.push(`worldId=${desc.worldId}`);
  if (desc.evidenceIds?.length) notes.push(`evidence=${desc.evidenceIds.join(",")}`);
  return { pbr, universal, raster, status: "partial", notes };
}

/** Convenience: UniversalMaterial → PBR snapshot (identity bridge). */
export function universalToPbr(mat: UniversalMaterial): PbrParams {
  const n = normalizeUniversalMaterial(mat);
  return constitutionalToPbr({
    id: n.id,
    type: n.type,
    baseColor: n.baseColor,
    roughness: n.roughness,
    metallic: n.metallic,
    emissive: n.emissive,
  });
}
