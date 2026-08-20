/**
 * Skin layer applier — PBR presets on named meshes.
 * Status: partial. Surface-only. Fixture GLB has a single mesh named `body`.
 * belly/leather/armor/eye/nose regions are declared until the hull is split.
 */

import * as THREE from "three";

export const SKIN_MESH_NAME = "body";

/** Constitutional / fixture region names. Hull GLB currently only ships `body`. */
export const CONSTITUTIONAL_SKIN_REGIONS = [
  "body",
  "whole-body",
  "belly",
  "leather",
  "armor",
  "cloth",
  "eye",
  "nose",
] as const;

export interface SkinLayerConfig {
  baseColor: string;
  roughness: number;
  metallic: number;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  opacity?: number;
  isFur?: boolean;
  furDensity?: number;
}

export const SKIN_PRESETS: Record<string, SkinLayerConfig> = {
  "fox-fur": {
    baseColor: "#d4763a",
    roughness: 0.85,
    metallic: 0.0,
    isFur: true,
    furDensity: 0.7,
  },
  "fox-belly": {
    baseColor: "#f5e6d0",
    roughness: 0.9,
    metallic: 0.0,
    isFur: true,
    furDensity: 0.5,
  },
  "leather-dark": {
    baseColor: "#2a1a0e",
    roughness: 0.45,
    metallic: 0.05,
  },
  "leather-brown": {
    baseColor: "#5c3a1e",
    roughness: 0.5,
    metallic: 0.02,
  },
  "armor-metal": {
    baseColor: "#4a4a5a",
    roughness: 0.3,
    metallic: 0.8,
  },
  "cloth-dark": {
    baseColor: "#1a1a2e",
    roughness: 0.75,
    metallic: 0.0,
  },
  "eye-white": {
    baseColor: "#f0f0f0",
    roughness: 0.1,
    metallic: 0.0,
    opacity: 0.95,
  },
  "nose-wet": {
    baseColor: "#2a1520",
    roughness: 0.05,
    metallic: 0.1,
  },
};

export function applySkinLayer(
  root: THREE.Object3D,
  config: SkinLayerConfig,
  regionFilter?: string
): number {
  let applied = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child;
    if (regionFilter && mesh.name !== regionFilter) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    material.color = new THREE.Color(config.baseColor);
    material.roughness = config.roughness;
    material.metalness = config.metallic;
    if (config.opacity !== undefined) {
      material.transparent = config.opacity < 1;
      material.opacity = config.opacity;
    }
    if (config.isFur) {
      const physical = material as THREE.MeshStandardMaterial & {
        sheen?: number;
        sheenRoughness?: number;
        sheenColor?: THREE.Color;
      };
      physical.sheen = 0.3;
      physical.sheenRoughness = 0.8;
      physical.sheenColor = new THREE.Color(config.baseColor).multiplyScalar(1.2);
      material.roughness = Math.max(config.roughness, 0.8);
      material.metalness = 0;
    }
    material.needsUpdate = true;
    applied += 1;
  });
  return applied;
}

/**
 * Surface-only fox-warrior look. Applies fox-fur to `body` / `whole-body` if present.
 * Other constitutional region names are declared (no matching meshes on the hull).
 */
export function applyFoxWarriorSkin(root: THREE.Object3D): {
  applied: number;
  skippedRegions: string[];
} {
  const hullTargets = ["body", "whole-body"] as const;
  let applied = 0;
  for (const name of hullTargets) {
    applied += applySkinLayer(root, SKIN_PRESETS["fox-fur"], name);
  }
  const skippedRegions = CONSTITUTIONAL_SKIN_REGIONS.filter(
    (r) => r !== "body" && r !== "whole-body"
  );
  return { applied, skippedRegions: [...skippedRegions] };
}
