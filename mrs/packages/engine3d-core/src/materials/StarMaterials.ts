/**
 * UniversalMaterial presets for 4D stars (Draft 0.1).
 *
 * UM-STAR-CORE / UM-STAR-ARM / UM-STAR-HALO — cataloged, deterministic IDs.
 * Status: **enforced** by create4dStarWorld + catalog attachment tests.
 */

import {
  createUniversalMaterial,
  type UniversalMaterial,
} from "../world/WorldObject.js";

export const MATERIAL_CATALOG_VERSION = "1.0.0" as const;
export const STAR_CONSTRUCTION_ALGORITHM_ID = "rt4d-star-lattice/0.1" as const;

/** Radiant high-energy core (mandala-core). */
export const starCoreMaterial: UniversalMaterial = createUniversalMaterial({
  id: "um_star_core",
  type: "mandala-core",
  baseColor: [0.85, 0.35, 1.0],
  roughness: 0.35,
  metallic: 0,
  emissive: [1.8, 0.55, 2.4],
});

/** Directional lattice-modulated arm (energy-lattice). */
export const starArmMaterial: UniversalMaterial = createUniversalMaterial({
  id: "um_star_arm",
  type: "energy-lattice",
  baseColor: [0.2, 0.55, 1.0],
  roughness: 0.18,
  metallic: 0.05,
  emissive: [0.55, 1.1, 1.8],
});

/** Optional soft halo shell (neon-grid / tesseract-surface). */
export const starHaloMaterial: UniversalMaterial = createUniversalMaterial({
  id: "um_star_halo",
  type: "neon-grid",
  baseColor: [0.15, 0.9, 0.55],
  roughness: 0.55,
  metallic: 0,
  emissive: [0.12, 0.45, 0.28],
});

export const DEFAULT_STAR_MATERIALS: Readonly<Record<string, UniversalMaterial>> =
  Object.freeze({
    um_star_core: starCoreMaterial,
    um_star_arm: starArmMaterial,
    um_star_halo: starHaloMaterial,
  });

export function starMaterialCatalog(): UniversalMaterial[] {
  return [starCoreMaterial, starArmMaterial, starHaloMaterial].map((m) => ({
    ...m,
    baseColor: [...m.baseColor] as [number, number, number],
    emissive: [...m.emissive] as [number, number, number],
    textureRefs: [...m.textureRefs],
  }));
}
