/**
 * Skin Layer Applier — applies fur, leather, and surface material layers
 * to a GLB-loaded three.js scene.
 *
 * This is the "right panel" of the character pipeline:
 * 4D energy → clay mesh + rig (GLB) → final look (skin layers).
 *
 * Skin layers are surface-only — they NEVER mutate the mesh topology.
 * This is enforced by the constitutional contract.
 */

import * as THREE from "three";

/** Minimal skin layer configuration */
export interface SkinLayerConfig {
  readonly baseColor: string;
  readonly roughness: number;
  readonly metallic: number;
  readonly isFur?: boolean;
  readonly furDensity?: number;
  readonly opacity?: number;
  readonly normalMapUrl?: string;
  readonly roughnessMapUrl?: string;
}

/** Preset skin layer configurations for common materials */
export const SKIN_PRESETS: Record<string, SkinLayerConfig> = {
  /** Fox fur */
  "fox-fur": {
    baseColor: "#d4763a",
    roughness: 0.85,
    metallic: 0.0,
    isFur: true,
    furDensity: 0.7,
  },
  /** Fox belly */
  "fox-belly": {
    baseColor: "#f5e6d0",
    roughness: 0.9,
    metallic: 0.0,
    isFur: true,
    furDensity: 0.5,
  },
  /** Leather dark */
  "leather-dark": {
    baseColor: "#2a1a0e",
    roughness: 0.45,
    metallic: 0.05,
  },
  /** Leather brown */
  "leather-brown": {
    baseColor: "#5c3a1e",
    roughness: 0.5,
    metallic: 0.02,
  },
  /** Armor metal */
  "armor-metal": {
    baseColor: "#4a4a5a",
    roughness: 0.3,
    metallic: 0.8,
  },
  /** Cloth dark */
  "cloth-dark": {
    baseColor: "#1a1a2e",
    roughness: 0.75,
    metallic: 0.0,
  },
};

/**
 * Apply a skin layer to all meshes in a three.js scene.
 * Surface-only: modifies material properties, never geometry.
 */
export function applySkinLayer(
  root: THREE.Object3D,
  config: SkinLayerConfig,
  regionFilter?: string
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material || !(material instanceof THREE.MeshStandardMaterial)) return;

    // If region filter is set, only apply to matching meshes
    if (regionFilter && mesh.name && !mesh.name.includes(regionFilter)) return;

    // Apply base PBR properties
    material.color = new THREE.Color(config.baseColor);
    material.roughness = config.roughness;
    ;(material as any).metallic = config.metallic;

    if (config.opacity !== undefined) {
      material.transparent = config.opacity < 1;
      material.opacity = config.opacity;
    }

    material.needsUpdate = true;
  });
}

/**
 * Apply a full character skin configuration (fox warrior example).
 * Maps regions to skin layer presets.
 */
export function applyFoxWarriorSkin(root: THREE.Object3D): void {
  // Body fur
  applySkinLayer(root, SKIN_PRESETS["fox-fur"], "body");

  // Belly (lighter fur)
  applySkinLayer(root, SKIN_PRESETS["fox-belly"], "belly");

  // Leather straps
  applySkinLayer(root, SKIN_PRESETS["leather-dark"], "leather");

  // Cloth
  applySkinLayer(root, SKIN_PRESETS["cloth-dark"], "cloth");

  // Eyes
  applySkinLayer(root, SKIN_PRESETS["eye-white"], "eye");

  // Nose
  applySkinLayer(root, SKIN_PRESETS["nose-wet"], "nose");
}

/**
 * Export skin layer configuration as JSON for the material editor.
 */
export function skinLayerToJson(
  config: SkinLayerConfig
): Record<string, unknown> {
  return {
    baseColor: config.baseColor,
    roughness: config.roughness,
    metallic: config.metallic,
    isFur: config.isFur ?? false,
    furDensity: config.furDensity,
    opacity: config.opacity,
  };
}