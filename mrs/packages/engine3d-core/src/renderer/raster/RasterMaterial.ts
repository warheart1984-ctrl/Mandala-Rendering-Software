/**
 * Soft-raster material shading for every UniversalMaterial type.
 *
 * Drive-G-1: CPU soft-raster approximates PBR intent (Lambert / GGX-ish /
 * Fresnel glass / emissive / skin SSS lift / hair anisotropy / procedural
 * palettes). Not Cycles transmission/caustics; not textured UV sampling yet.
 *
 * Status: **enforced** by unit tests for all MaterialType ids.
 */

import type { MaterialType, TextureRef, UniversalMaterial, Vec3Tuple } from "../../world/WorldObject.js";
import { normalizeUniversalMaterial } from "../../world/MaterialSystem.js";
import type { Vec3 } from "./HeadlessStillRenderer.js";

export interface RasterMaterial {
  readonly id: string;
  readonly type: MaterialType;
  readonly baseColor: Vec3;
  readonly metallic: number;
  readonly roughness: number;
  readonly emissive: Vec3;
  /** Glass transmission 0–1 (soft-raster: darken + Fresnel rim). */
  readonly transmission: number;
  readonly subsurface: number;
  readonly anisotropy: number;
  readonly textureRefs: readonly TextureRef[];
}

export function rasterMaterialFromUniversal(mat: UniversalMaterial): RasterMaterial {
  const n = normalizeUniversalMaterial(mat);
  const transmission = n.type === "glass" ? 1 : 0;
  const subsurface = n.type === "skin" ? 0.35 : 0;
  const anisotropy =
    n.type === "hair" ? 0.8 : n.type === "cloth" ? 0.35 : 0;
  return {
    id: n.id,
    type: n.type,
    baseColor: [n.baseColor[0], n.baseColor[1], n.baseColor[2]],
    metallic: n.metallic,
    roughness: n.roughness,
    emissive: [n.emissive[0], n.emissive[1], n.emissive[2]],
    transmission,
    subsurface,
    anisotropy,
    textureRefs: n.textureRefs ?? [],
  };
}

/** Legacy meshes: baseColor-only → basic Lambert. */
export function rasterMaterialFromBaseColor(
  baseColor: Vec3,
  id = "legacy",
): RasterMaterial {
  return {
    id,
    type: "basic",
    baseColor,
    metallic: 0,
    roughness: 0.7,
    emissive: [0, 0, 0],
    transmission: 0,
    subsurface: 0,
    anisotropy: 0,
    textureRefs: [],
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function proceduralTint(type: MaterialType, base: Vec3): Vec3 {
  switch (type) {
    case "neon-grid":
      return [0.15, 0.95, 0.55];
    case "mandala-core":
      return [0.85, 0.35, 1.0];
    case "tesseract-surface":
      return [0.25, 0.75, 1.0];
    case "sovereign-glyph":
      return [0.95, 0.85, 0.35];
    case "energy-lattice":
      return [0.2, 0.55, 1.0];
    default:
      return base;
  }
}

/**
 * Shade one fragment given world-space normal and light direction (toward surface).
 * `viewDir` points toward the camera (optional; defaults to -light for rim).
 */
export function shadeRasterFragment(
  mat: RasterMaterial,
  normal: Vec3,
  lightDir: Vec3,
  viewDir?: Vec3,
): Vec3 {
  const ndl = Math.max(0, -(normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2]));
  const view: Vec3 = viewDir ?? [-lightDir[0], -lightDir[1], -lightDir[2]];
  const ndv = Math.max(
    0,
    normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2],
  );
  // Half vector for cheap specular
  const hx = -lightDir[0] + view[0];
  const hy = -lightDir[1] + view[1];
  const hz = -lightDir[2] + view[2];
  const hl = Math.hypot(hx, hy, hz) || 1;
  const ndh = Math.max(0, (normal[0] * hx + normal[1] * hy + normal[2] * hz) / hl);

  const rough = clamp01(mat.roughness);
  const metal = clamp01(mat.metallic);
  const gloss = Math.pow(ndh, Math.max(4, (1 - rough) * 128));
  const fresnel = Math.pow(1 - ndv, 5);

  let albedo: Vec3 = [...mat.baseColor] as [number, number, number];
  if (
    mat.type === "neon-grid" ||
    mat.type === "mandala-core" ||
    mat.type === "tesseract-surface" ||
    mat.type === "sovereign-glyph" ||
    mat.type === "energy-lattice"
  ) {
    const tint = proceduralTint(mat.type, albedo);
    albedo = [
      albedo[0] * 0.35 + tint[0] * 0.65,
      albedo[1] * 0.35 + tint[1] * 0.65,
      albedo[2] * 0.35 + tint[2] * 0.65,
    ];
  }

  let r = 0;
  let g = 0;
  let b = 0;

  switch (mat.type) {
    case "metal": {
      const amb = 0.08;
      const diff = (0.15 + 0.85 * ndl) * (1 - metal * 0.85);
      const spec = gloss * (0.35 + 0.65 * metal) * (1.1 - rough * 0.7);
      r = albedo[0] * (amb + diff) + albedo[0] * spec;
      g = albedo[1] * (amb + diff) + albedo[1] * spec;
      b = albedo[2] * (amb + diff) + albedo[2] * spec;
      break;
    }
    case "glass": {
      const T = clamp01(mat.transmission);
      const rimBoost = 1.22;
      const F = clamp01(0.04 + (1 - 0.04) * fresnel * rimBoost);
      const transmit = (1 - F) * T;
      // Soft glass: see-through darkening + bright Fresnel rim + mild base.
      const amb = 0.12 + transmit * 0.25;
      const rim = F * (0.55 + 0.45 * (1 - rough));
      r = albedo[0] * amb + rim * (0.55 + albedo[0] * 0.45);
      g = albedo[1] * amb + rim * (0.75 + albedo[1] * 0.25);
      b = albedo[2] * amb + rim * (0.95 + albedo[2] * 0.05);
      break;
    }
    case "emissive": {
      const amb = 0.15 + 0.35 * ndl;
      r = albedo[0] * amb + mat.emissive[0];
      g = albedo[1] * amb + mat.emissive[1];
      b = albedo[2] * amb + mat.emissive[2];
      break;
    }
    case "skin": {
      const sss = mat.subsurface;
      const wrap = Math.max(0, (ndl + sss) / (1 + sss));
      const warm = 0.12 * sss * (1 - ndl);
      r = albedo[0] * (0.25 + 0.75 * wrap) + warm;
      g = albedo[1] * (0.25 + 0.75 * wrap) + warm * 0.4;
      b = albedo[2] * (0.25 + 0.75 * wrap);
      r += gloss * (1 - rough) * 0.08;
      g += gloss * (1 - rough) * 0.08;
      b += gloss * (1 - rough) * 0.08;
      break;
    }
    case "hair": {
      // Cheap anisotropic: stretch specular along a tangent from normal × up.
      const tx = normal[1];
      const ty = -normal[0];
      const tz = 0;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const tdh = Math.abs((tx * hx + ty * hy + tz * hz) / (tl * hl));
      const aniso = Math.pow(1 - tdh, 4 + mat.anisotropy * 12) * (1 - rough);
      const amb = 0.18 + 0.55 * ndl;
      r = albedo[0] * amb + aniso * 0.55;
      g = albedo[1] * amb + aniso * 0.45;
      b = albedo[2] * amb + aniso * 0.35;
      break;
    }
    case "cloth": {
      const sheen = fresnel * (0.2 + mat.anisotropy * 0.35) * (1 - rough);
      const amb = 0.22 + 0.78 * ndl;
      r = albedo[0] * amb + sheen;
      g = albedo[1] * amb + sheen;
      b = albedo[2] * amb + sheen;
      break;
    }
    case "plastic": {
      const amb = 0.18 + 0.82 * ndl;
      const spec = gloss * (0.25 * (1 - metal) + 0.05);
      r = albedo[0] * amb + spec;
      g = albedo[1] * amb + spec;
      b = albedo[2] * amb + spec;
      break;
    }
    case "wood":
    case "stone": {
      const grain = 0.92 + 0.08 * Math.sin((normal[0] + normal[2]) * 12);
      const amb = (0.2 + 0.8 * ndl) * grain * (0.85 + 0.15 * (1 - rough));
      r = albedo[0] * amb;
      g = albedo[1] * amb;
      b = albedo[2] * amb;
      break;
    }
    case "neon-grid":
    case "mandala-core":
    case "tesseract-surface":
    case "sovereign-glyph":
    case "energy-lattice": {
      const amb = 0.2 + 0.55 * ndl;
      const glow = 0.35 + fresnel * 0.55;
      r = albedo[0] * amb + albedo[0] * glow * 0.45 + mat.emissive[0];
      g = albedo[1] * amb + albedo[1] * glow * 0.45 + mat.emissive[1];
      b = albedo[2] * amb + albedo[2] * glow * 0.45 + mat.emissive[2];
      break;
    }
    case "basic":
    default: {
      const amb = 0.2 + 0.8 * ndl;
      r = albedo[0] * amb;
      g = albedo[1] * amb;
      b = albedo[2] * amb;
      break;
    }
  }

  // Universal emissive add (non-emissive types may still carry mild emission).
  if (mat.type !== "emissive") {
    r += mat.emissive[0] * 0.35;
    g += mat.emissive[1] * 0.35;
    b += mat.emissive[2] * 0.35;
  }

  return [clamp01(r), clamp01(g), clamp01(b)];
}

export function materialTypeCoverage(): readonly MaterialType[] {
  return [
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
  ];
}

/** Distinct default UniversalMaterial for every type (still / showcase). */
export function createDefaultMaterialCatalog(): UniversalMaterial[] {
  const specs: Array<{
    type: MaterialType;
    baseColor: Vec3Tuple;
    roughness: number;
    metallic: number;
    emissive?: Vec3Tuple;
  }> = [
    { type: "basic", baseColor: [0.75, 0.75, 0.8], roughness: 0.7, metallic: 0 },
    { type: "metal", baseColor: [0.05, 0.05, 0.05], roughness: 0.08, metallic: 1 },
    { type: "glass", baseColor: [0.15, 0.45, 1.0], roughness: 0.03, metallic: 0, emissive: [0.45, 1.05, 1.5] },
    { type: "emissive", baseColor: [1, 1, 1], roughness: 0.5, metallic: 0, emissive: [12, 12, 12] },
    { type: "skin", baseColor: [0.82, 0.62, 0.52], roughness: 0.5, metallic: 0 },
    { type: "hair", baseColor: [0.22, 0.12, 0.08], roughness: 0.35, metallic: 0 },
    { type: "cloth", baseColor: [0.35, 0.4, 0.55], roughness: 0.75, metallic: 0 },
    { type: "plastic", baseColor: [0.9, 0.25, 0.2], roughness: 0.35, metallic: 0 },
    { type: "wood", baseColor: [0.45, 0.28, 0.14], roughness: 0.65, metallic: 0 },
    { type: "stone", baseColor: [0.55, 0.55, 0.52], roughness: 0.85, metallic: 0 },
    { type: "neon-grid", baseColor: [0.1, 0.9, 0.5], roughness: 0.25, metallic: 0, emissive: [0.2, 1.2, 0.6] },
    { type: "mandala-core", baseColor: [0.8, 0.3, 1], roughness: 0.4, metallic: 0, emissive: [0.6, 0.2, 1.2] },
    { type: "tesseract-surface", baseColor: [0.2, 0.7, 1], roughness: 0.2, metallic: 0.15, emissive: [0.15, 0.4, 0.9] },
    { type: "sovereign-glyph", baseColor: [0.95, 0.85, 0.3], roughness: 0.3, metallic: 0.2, emissive: [0.8, 0.6, 0.1] },
    { type: "energy-lattice", baseColor: [0.15, 0.45, 1], roughness: 0.15, metallic: 0, emissive: [0.3, 0.7, 1.4] },
  ];
  return specs.map((s) =>
    normalizeUniversalMaterial({
      id: `default_${s.type}`,
      type: s.type,
      baseColor: s.baseColor,
      roughness: s.roughness,
      metallic: s.metallic,
      emissive: s.emissive ?? [0, 0, 0],
    }),
  );
}
