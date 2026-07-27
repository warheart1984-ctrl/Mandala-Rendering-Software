/**
 * Face rig load + pose application over HumanRig.
 * Status: **prepared** / enforced by tests against fixture GLB.
 */

import { readFileSync } from "node:fs";
import { loadHumanRigFromGlb } from "../human/HumanRigLoader.js";
import { deformHumanRig } from "../human/HumanRigDeformer.js";
import type {
  DeformedHumanRigFrame,
  HumanRig,
  Mat4Tuple,
  Pose,
} from "../human/HumanRigTypes.js";
import { IDENTITY_MAT4, mat4 } from "../human/mat4.js";
import type { FaceRigConfig } from "./FaceRigConfig.js";
import {
  DEFAULT_FACE_BLENDSHAPES,
  DEFAULT_FACE_BONES,
} from "./FaceRigConfig.js";
import type { FacePoseFrame } from "./FacePoseFrame.js";
import { detectFaceAssetKind } from "./resolveHumanFacePath.js";

export interface LoadedFaceRig {
  config: FaceRigConfig;
  rig: HumanRig;
  assetKind: "fixture" | "operator";
}

function translationMat4(tx: number, ty: number, tz: number): Mat4Tuple {
  return mat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]);
}

function toMat4(value: number[]): Mat4Tuple {
  if (value.length === 16) return mat4(value);
  if (value.length === 3) return translationMat4(value[0]!, value[1]!, value[2]!);
  throw new Error(
    `face bone transform must be 3 (translation) or 16 (mat4) floats, got ${value.length}`,
  );
}

export function validateFaceRig(
  rig: HumanRig,
  config: FaceRigConfig,
): { ok: boolean; missingBones: string[]; missingBlendshapes: string[] } {
  const boneIds = new Set(rig.skeleton.bones.map((b) => b.id));
  const requiredBones = config.requiredBones ?? [...DEFAULT_FACE_BONES];
  const missingBones = requiredBones.filter((id) => !boneIds.has(id));

  const morphIds = new Set<string>();
  for (const mesh of rig.meshes.all) {
    for (const ch of mesh.morphChannels) morphIds.add(ch.id);
  }
  const requiredMorphs =
    config.blendshapes.length > 0 ? config.blendshapes : [...DEFAULT_FACE_BLENDSHAPES];
  const missingBlendshapes = requiredMorphs.filter((id) => !morphIds.has(id));

  return {
    ok: missingBones.length === 0 && missingBlendshapes.length === 0,
    missingBones,
    missingBlendshapes,
  };
}

export function loadFaceRig(config: FaceRigConfig): LoadedFaceRig {
  const bytes = readFileSync(config.meshPath);
  const rig = loadHumanRigFromGlb(bytes, { id: `face:${config.meshPath}` });
  const check = validateFaceRig(rig, config);
  if (config.strict !== false && !check.ok) {
    throw new Error(
      `Face rig validation failed: missingBones=${check.missingBones.join(",") || "none"} ` +
        `missingBlendshapes=${check.missingBlendshapes.join(",") || "none"}`,
    );
  }
  return {
    config,
    rig,
    assetKind: detectFaceAssetKind(config.meshPath),
  };
}

/**
 * Apply FacePoseFrame → deformHumanRig (bones + morph weights).
 * Does not mutate topology (indices unchanged).
 */
export function applyFacePose(
  loaded: LoadedFaceRig,
  pose: FacePoseFrame,
): DeformedHumanRigFrame {
  const boneTransforms: Record<string, Mat4Tuple> = {};
  for (const bone of loaded.rig.skeleton.bones) {
    boneTransforms[bone.id] = bone.localTransform;
  }
  for (const [name, value] of Object.entries(pose.bones)) {
    if (!boneTransforms[name]) continue;
    boneTransforms[name] = toMat4(value);
  }

  const morphWeights: Record<string, number> = {};
  for (const expr of pose.expressions) {
    const w = Math.max(0, Math.min(1, expr.weight));
    if (w !== 0) morphWeights[expr.name] = w;
  }

  const transientPose: Pose = {
    id: `face-pose@${pose.time}`,
    boneTransforms,
    expressionParams: {},
    morphWeights,
  };

  // deformHumanRig looks up pose by id in library — so patch via temporary pose injection.
  const patched: HumanRig = {
    ...loaded.rig,
    poses: {
      poses: [...loaded.rig.poses.poses, transientPose],
    },
  };
  return deformHumanRig(patched, transientPose.id, pose.time);
}

export function neutralFacePose(time = 0): FacePoseFrame {
  return { time, bones: {}, expressions: [] };
}

export { IDENTITY_MAT4 };
