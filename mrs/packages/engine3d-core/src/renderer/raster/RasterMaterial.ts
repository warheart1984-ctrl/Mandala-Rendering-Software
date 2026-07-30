/**
 * Soft-raster material shading for every UniversalMaterial type.
 *
 * Drive-G-1: CPU soft-raster approximates PBR intent (Lambert / GGX-ish /
 * Fresnel glass / emissive / skin SSS lift / hair anisotropy / procedural
 * palettes). Multi-light accumulation is **enforced** by upgrade tests.
 * Not Cycles transmission/caustics; UV maps when TextureBinder is wired.
 *
 * Constitutional descriptors enter via ShaderBridge
 * (`bridgeConstitutionalMaterial`) which calls this after PBR translation.
 * Bridge status: **partial** — not photoreal.
 *
 * Status: **enforced** by unit tests for all MaterialType ids.
 */

import type { MaterialType, TextureRef, UniversalMaterial, Vec3Tuple } from "../../world/WorldObject.js";
import { normalizeUniversalMaterial } from "../../world/MaterialSystem.js";
import type { Vec3 } from "./HeadlessStillRenderer.js";

/** Directional light for soft-raster (direction points toward the surface). */
export interface RasterLight {
  direction: Vec3;
  /** Linear intensity multiplier (default 1). */
  intensity?: number;
  /** RGB tint 0–1+ (default white). */
  color?: Vec3;
}

export interface ShadeRasterOptions {
  /** Scale baked ambient in type branches (1 = full; 0 = direct only). */
  ambientScale?: number;
  /** Whether to add material emissive (once per fragment for multi-light). */
  includeEmissive?: boolean;
  /** Extra intensity on direct terms. */
  intensity?: number;
  /** Light RGB tint. */
  lightColor?: Vec3;
}

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

/** Deterministic micro-variation so flat box faces read less plastic. */
function microGrain(normal: Vec3, scale = 1): number {
  const n =
    Math.sin(
      normal[0] * 17.13 * scale +
        normal[1] * 41.77 * scale +
        normal[2] * 29.31 * scale,
    ) * 43758.5453;
  const f = n - Math.floor(n);
  return 0.9 + 0.2 * f;
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
  options?: ShadeRasterOptions,
): Vec3 {
  const ambScale = options?.ambientScale ?? 1;
  const includeEmissive = options?.includeEmissive !== false;
  const intensity = options?.intensity ?? 1;
  const lc = options?.lightColor ?? ([1, 1, 1] as Vec3);

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
      const amb = 0.05 * ambScale;
      const grain = microGrain(normal, 1.4);
      const diff = (0.12 + 0.88 * ndl) * (1 - metal * 0.85) * grain;
      // Stronger env-like specular (still single-dir soft-raster — not SSR).
      const spec = gloss * (0.45 + 0.7 * metal) * (1.2 - rough * 0.75);
      const refl = fresnel * (0.12 + 0.28 * metal) * (1 - rough);
      r = albedo[0] * (amb + diff) + albedo[0] * spec + refl * 0.85;
      g = albedo[1] * (amb + diff) + albedo[1] * spec + refl * 0.9;
      b = albedo[2] * (amb + diff) + albedo[2] * spec + refl;
      break;
    }
    case "glass": {
      const T = clamp01(mat.transmission);
      const rimBoost = 1.35;
      const F = clamp01(0.04 + (1 - 0.04) * fresnel * rimBoost);
      const transmit = (1 - F) * T;
      // Soft glass: see-through darkening + bright Fresnel rim + mild base.
      const amb = (0.1 + transmit * 0.22) * ambScale;
      const rim = F * (0.65 + 0.5 * (1 - rough));
      const mirror = gloss * (1 - rough) * 0.22;
      r = albedo[0] * amb + rim * (0.55 + albedo[0] * 0.45) + mirror;
      g = albedo[1] * amb + rim * (0.75 + albedo[1] * 0.25) + mirror * 1.05;
      b = albedo[2] * amb + rim * (0.95 + albedo[2] * 0.05) + mirror * 1.15;
      break;
    }
    case "emissive": {
      const amb = 0.15 * ambScale + 0.35 * ndl;
      r = albedo[0] * amb + (includeEmissive ? mat.emissive[0] : 0);
      g = albedo[1] * amb + (includeEmissive ? mat.emissive[1] : 0);
      b = albedo[2] * amb + (includeEmissive ? mat.emissive[2] : 0);
      break;
    }
    case "skin": {
      const sss = mat.subsurface;
      const wrap = Math.max(0, (ndl + sss) / (1 + sss));
      const warm = 0.12 * sss * (1 - ndl);
      const baseAmb = 0.25 * ambScale;
      r = albedo[0] * (baseAmb + 0.75 * wrap) + warm;
      g = albedo[1] * (baseAmb + 0.75 * wrap) + warm * 0.4;
      b = albedo[2] * (baseAmb + 0.75 * wrap);
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
      const amb = 0.18 * ambScale + 0.55 * ndl;
      r = albedo[0] * amb + aniso * 0.55;
      g = albedo[1] * amb + aniso * 0.45;
      b = albedo[2] * amb + aniso * 0.35;
      break;
    }
    case "cloth": {
      const sheen = fresnel * (0.2 + mat.anisotropy * 0.35) * (1 - rough);
      const grain = microGrain(normal, 2.2);
      const amb = (0.16 * ambScale + 0.84 * ndl) * grain;
      r = albedo[0] * amb + sheen;
      g = albedo[1] * amb + sheen;
      b = albedo[2] * amb + sheen;
      break;
    }
    case "plastic": {
      const amb = 0.18 * ambScale + 0.82 * ndl;
      const spec = gloss * (0.25 * (1 - metal) + 0.05);
      r = albedo[0] * amb + spec;
      g = albedo[1] * amb + spec;
      b = albedo[2] * amb + spec;
      break;
    }
    case "wood":
    case "stone": {
      const grain =
        (0.9 + 0.1 * Math.sin((normal[0] + normal[2]) * 14)) *
        microGrain(normal, mat.type === "wood" ? 2.8 : 1.6);
      const amb =
        (0.14 * ambScale + 0.86 * ndl) * grain * (0.82 + 0.18 * (1 - rough));
      const softSpec = gloss * (1 - rough) * (mat.type === "wood" ? 0.06 : 0.04);
      r = albedo[0] * amb + softSpec;
      g = albedo[1] * amb + softSpec * 0.9;
      b = albedo[2] * amb + softSpec * 0.8;
      break;
    }
    case "neon-grid":
    case "mandala-core":
    case "tesseract-surface":
    case "sovereign-glyph":
    case "energy-lattice": {
      const amb = 0.2 * ambScale + 0.55 * ndl;
      const glow = 0.35 + fresnel * 0.55;
      r = albedo[0] * amb + albedo[0] * glow * 0.45;
      g = albedo[1] * amb + albedo[1] * glow * 0.45;
      b = albedo[2] * amb + albedo[2] * glow * 0.45;
      if (includeEmissive) {
        r += mat.emissive[0];
        g += mat.emissive[1];
        b += mat.emissive[2];
      }
      break;
    }
    case "basic":
    default: {
      const amb = 0.2 * ambScale + 0.8 * ndl;
      r = albedo[0] * amb;
      g = albedo[1] * amb;
      b = albedo[2] * amb;
      break;
    }
  }

  // Universal emissive add (non-emissive types may still carry mild emission).
  if (includeEmissive && mat.type !== "emissive") {
    r += mat.emissive[0] * 0.35;
    g += mat.emissive[1] * 0.35;
    b += mat.emissive[2] * 0.35;
  }

  r *= intensity * lc[0];
  g *= intensity * lc[1];
  b *= intensity * lc[2];

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Accumulate multiple directional lights (key + fills). Ambient/emissive once.
 */
export function shadeRasterFragmentLights(
  mat: RasterMaterial,
  normal: Vec3,
  lights: readonly RasterLight[],
  viewDir?: Vec3,
): Vec3 {
  if (!lights.length) {
    return shadeRasterFragment(mat, normal, [-0.35, -1, -0.45], viewDir);
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i]!;
    const dir = normalizeLightDir(L.direction);
    const rgb = shadeRasterFragment(mat, normal, dir, viewDir, {
      ambientScale: i === 0 ? 1 : 0,
      includeEmissive: i === 0,
      intensity: L.intensity ?? 1,
      lightColor: L.color,
    });
    r += rgb[0];
    g += rgb[1];
    b += rgb[2];
  }
  return [clamp01(r), clamp01(g), clamp01(b)];
}

function normalizeLightDir(d: Vec3): Vec3 {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

/** Portrait / cinematic 3-light rig (key warm, fill cool, rim). */
export function createCinematicLightRig(keyDir?: Vec3): RasterLight[] {
  const key = keyDir ?? ([-0.35, -1.0, -0.45] as Vec3);
  return [
    { direction: key, intensity: 1.05, color: [1.0, 0.96, 0.9] },
    { direction: [0.55, -0.65, 0.35], intensity: 0.42, color: [0.7, 0.82, 1.0] },
    { direction: [0.15, 0.35, -0.9], intensity: 0.28, color: [1.0, 0.92, 0.85] },
  ];
}

/**
 * Dramatic key-heavy rig for deeper shadows / mood (cinematic-v2).
 * Soft-raster approximation — not area-light soft shadows.
 */
export function createDramaticCinematicLightRig(keyDir?: Vec3): RasterLight[] {
  const key = keyDir ?? ([-0.35, -1.0, -0.45] as Vec3);
  return [
    { direction: key, intensity: 1.22, color: [1.0, 0.94, 0.86] },
    { direction: [0.55, -0.55, 0.4], intensity: 0.22, color: [0.55, 0.72, 0.95] },
    { direction: [0.1, 0.45, -0.85], intensity: 0.38, color: [1.0, 0.9, 0.78] },
  ];
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
