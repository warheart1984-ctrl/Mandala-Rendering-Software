/**
 * Glass / chrome / core presets for neural-lattice / tesseract scenes.
 *
 * Drive-G-1: These map into UniversalMaterial (baseColor/metallic/roughness/emissive).
 * Soft-raster does **not** implement Cycles-grade transmission/caustics.
 * `glass` declares transmission intent via MaterialSystem → dielectric.
 * RT4D SceneSpec / render-still paths bind these roles onto OrientedCapsule
 * beams + chrome joints + emissive core (not bead chains).
 *
 * Status: **enforced** when bound via World3D.addLatticeMaterials /
 * WorldGenerator mandala / SceneSpec materialRole / material-aware soft-raster.
 * Soft-raster approximates glass/chrome/core; RT4D path-traces capsules when
 * WorldDocument → RT4D bridge is used.
 */

import {
  createUniversalMaterial,
  type UniversalMaterial,
} from "../world/WorldObject.js";

/** Soft blue glass tube — transmission declared; mild cyan emissive for neon rim. */
export const glassTubeMaterial: UniversalMaterial = createUniversalMaterial({
  id: "glass_tube",
  type: "glass",
  baseColor: [0.15, 0.45, 1.0],
  roughness: 0.03,
  metallic: 0,
  // UniversalMaterial has no emissionStrength; bake strength into emissive RGB.
  emissive: [0.3 * 1.5, 0.7 * 1.5, 1.0 * 1.5],
});

/** Black chrome joint spheres at lattice vertices. */
export const chromeJointMaterial: UniversalMaterial = createUniversalMaterial({
  id: "chrome_joint",
  type: "metal",
  baseColor: [0.05, 0.05, 0.05],
  roughness: 0.08,
  metallic: 1.0,
  emissive: [0, 0, 0],
});

/** Central energy core — bright white emission. */
export const coreGlowMaterial: UniversalMaterial = createUniversalMaterial({
  id: "core_glow",
  type: "emissive",
  baseColor: [1.0, 1.0, 1.0],
  roughness: 0.5,
  metallic: 0,
  emissive: [15.0, 15.0, 15.0],
});

export const DEFAULT_LATTICE_MATERIALS: Readonly<Record<string, UniversalMaterial>> =
  Object.freeze({
    glass_tube: glassTubeMaterial,
    chrome_joint: chromeJointMaterial,
    core_glow: coreGlowMaterial,
  });

export function bindDefaultLatticeMaterials(
  target: Record<string, UniversalMaterial>,
): Record<string, UniversalMaterial> {
  target["glass_tube"] = glassTubeMaterial;
  target["chrome_joint"] = chromeJointMaterial;
  target["core_glow"] = coreGlowMaterial;
  return target;
}
