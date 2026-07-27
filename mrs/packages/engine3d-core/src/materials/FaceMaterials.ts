/**
 * Face material presets for Engine3D face meshes.
 *
 * Soft-raster today binds baseColor roles (skin/eye/mouth). Texture map paths
 * are **declared** until the raster path samples UV textures.
 * Status: **prepared** (baseColor enforced in soft-raster roles; maps declared).
 */

import {
  createUniversalMaterial,
  type UniversalMaterial,
} from "../world/WorldObject.js";

/** Declared texture id paths — operators drop files under mrs/assets/human/textures/. */
const TEX = {
  skinBase: "textures/face/skin_basecolor.png",
  skinNormal: "textures/face/skin_normal.png",
  skinRough: "textures/face/skin_roughness.png",
  eyeIris: "textures/face/eye_iris.png",
  eyeNormal: "textures/face/eye_normal.png",
  mouthBase: "textures/face/mouth_basecolor.png",
} as const;

export const skinMaterial: UniversalMaterial = createUniversalMaterial({
  id: "face_skin",
  type: "skin",
  baseColor: [0.82, 0.62, 0.52],
  roughness: 0.5,
  metallic: 0,
  textureRefs: [
    { id: TEX.skinBase, role: "color" },
    { id: TEX.skinNormal, role: "normal" },
    { id: TEX.skinRough, role: "roughness" },
  ],
});

export const eyeMaterial: UniversalMaterial = createUniversalMaterial({
  id: "eye",
  type: "basic",
  baseColor: [0.12, 0.18, 0.28],
  roughness: 0.1,
  metallic: 0,
  textureRefs: [
    { id: TEX.eyeIris, role: "color" },
    { id: TEX.eyeNormal, role: "normal" },
  ],
});

export const mouthMaterial: UniversalMaterial = createUniversalMaterial({
  id: "mouth",
  type: "basic",
  baseColor: [0.55, 0.22, 0.25],
  roughness: 0.3,
  metallic: 0,
  textureRefs: [{ id: TEX.mouthBase, role: "color" }],
});

export const DEFAULT_FACE_MATERIALS: Readonly<Record<string, UniversalMaterial>> =
  Object.freeze({
    face_skin: skinMaterial,
    eye: eyeMaterial,
    mouth: mouthMaterial,
  });

export function bindDefaultFaceMaterials(
  target: Record<string, UniversalMaterial>,
): Record<string, UniversalMaterial> {
  target["face_skin"] = skinMaterial;
  target["eye"] = eyeMaterial;
  target["mouth"] = mouthMaterial;
  return target;
}
