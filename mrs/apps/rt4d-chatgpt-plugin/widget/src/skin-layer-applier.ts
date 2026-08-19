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
import type { SkinLayer, SkinTextureChannels } from "../../sovereign-sculptor/src/types.js";

export interface SkinLayerConfig {
  /** Base color as hex or CSS color string */
  baseColor: string;
  /** Roughness in [0, 1] */
  roughness: number;
  /** Metallic in [0, 1] */
  metallic: number;
  /** Optional normal map URL */
  normalMapUrl?: string;
  /** Optional roughness map URL */
  roughnessMapUrl?: string;
  /** Opacity in [0, 1] */
  opacity?: number;
  /** Whether this is a fur layer */
  isFur?: boolean;
  /** Fur density (for fur layers) */
  furDensity?: number;
}

/** Preset skin layer configurations for common materials */
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

/**
 * Apply a skin layer to all meshes in a three.js scene.
 * Surface-only: modifies materials, never geometry.
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
    material.metallic = config.metallic;

    if (config.opacity !== undefined) {
      material.transparent = config.opacity < 1;
      material.opacity = config.opacity;
    }

    // Fur effect: modify material properties for fuzzy appearance
    if (config.isFur) {
      material.sheen = 0.3;
      material.sheenRoughness = 0.8;
      material.sheenColor = new THREE.Color(config.baseColor).multiplyScalar(1.2);
      material.roughness = Math.max(config.roughness, 0.8);
      material.metallic = 0;
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

  // Leather straps/armor
  applySkinLayer(root, SKIN_PRESETS["leather-dark"], "leather");
  applySkinLayer(root, SKIN_PRESETS["armor-metal"], "armor");

  // Cloth
  applySkinLayer(root, SKIN_PRESETS["cloth-dark"], "cloth");

  // Eyes
  applySkinLayer(root, SKIN_PRESETS["eye-white"], "eye");

  // Nose
  applySkinLayer(root, SKIN_PRESETS["nose-wet"], "nose");
}

/**
 * Apply a skin layer configuration from a Sovereign SkinLayer contract.
 * This bridges the constitutional skin layer format to three.js materials.
 */
export function applyConstitutionalSkinLayer(
  root: THREE.Object3D,
  layer: SkinLayer,
  textureLoader?: THREE.TextureLoader
): void {
  // Map material regions to preset configs
  for (const region of layer.materialRegions) {
    const channels = layer.textureChannels;
    const baseColorRef = channels.baseColor;

    // Try to match region to preset
    const preset = matchRegionToPreset(region.sculptRegionId);
    if (preset) {
      applySkinLayer(root, preset, region.sculptRegionId);
    }

    // Apply textures if loader is available
    if (textureLoader && baseColorRef) {
      applyTextureChannel(root, region.sculptRegionId, "map", baseColorRef.assetRef, textureLoader);
    }
    if (textureLoader && channels.normalDetail) {
      applyTextureChannel(root, region.sculptRegionId, "normalMap", channels.normalDetail.assetRef, textureLoader);
    }
    if (textureLoader && channels.roughness) {
      applyTextureChannel(root, region.sculptRegionId, "roughnessMap", channels.roughness.assetRef, textureLoader);
    }
  }
}

function matchRegionToPreset(regionId: string): SkinLayerConfig | null {
  const lower = regionId.toLowerCase();
  if (lower.includes("fur") || lower.includes("body") || lower.includes("tail")) return SKIN_PRESETS["fox-fur"];
  if (lower.includes("belly") || lower.includes("chest")) return SKIN_PRESETS["fox-belly"];
  if (lower.includes("leather") || lower.includes("strap")) return SKIN_PRESETS["leather-dark"];
  if (lower.includes("armor") || lower.includes("metal")) return SKIN_PRESETS["armor-metal"];
  if (lower.includes("cloth") || lower.includes("fabric")) return SKIN_PRESETS["cloth-dark"];
  if (lower.includes("eye")) return SKIN_PRESETS["eye-white"];
  if (lower.includes("nose") || lower.includes("muzzle")) return SKIN_PRESETS["nose-wet"];
  return null;
}

function applyTextureChannel(
  root: THREE.Object3D,
  regionId: string,
  materialProp: string,
  textureUrl: string,
  loader: THREE.TextureLoader
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.name.includes(regionId)) return;

    const material = child.material as THREE.MeshStandardMaterial;
    if (!material || !(material instanceof THREE.MeshStandardMaterial)) return;

    loader.load(textureUrl, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      (material as any)[materialProp] = texture;
      material.needsUpdate = true;
    });
  });
}

/**
 * Export skin layer configuration as JSON for the material editor.
 */
export function skinLayerToJson(
  layer: SkinLayer,
  config: SkinLayerConfig
): Record<string, unknown> {
  return {
    schemaVersion: layer.schemaVersion,
    id: layer.id,
    version: layer.version,
    rigId: layer.rigId,
    sculptDocumentId: layer.sculptDocumentId,
    materialRegions: layer.materialRegions,
    preview: {
      baseColor: config.baseColor,
      roughness: config.roughness,
      metallic: config.metallic,
      isFur: config.isFur,
    },
    provenance: layer.generationProvenance,
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}
