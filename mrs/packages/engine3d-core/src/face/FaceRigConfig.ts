/**
 * Face rig configuration (ENGINE3D_FACE_RIG_SCHEMA_v1.0).
 * Status: **prepared**.
 */

export const DEFAULT_FACE_BONES = [
  "Head",
  "Jaw",
  "LeftEye",
  "RightEye",
  "LeftBrow",
  "RightBrow",
  "UpperLip",
  "LowerLip",
] as const;

export const DEFAULT_FACE_BLENDSHAPES = [
  "Smile",
  "Frown",
  "BlinkLeft",
  "BlinkRight",
  "Squint",
  "WideEyes",
  "MouthOpen",
  "MouthNarrow",
] as const;

export interface FaceRigConfig {
  /** Absolute or repo-relative path to HumanFaceRigged.glb (or fixture). */
  meshPath: string;
  armatureName: string;
  blendshapes: string[];
  requiredBones?: string[];
  /** When true, missing required bone/blendshape names throw. */
  strict?: boolean;
}

export function defaultFaceRigConfig(meshPath: string): FaceRigConfig {
  return {
    meshPath,
    armatureName: "Armature",
    blendshapes: [...DEFAULT_FACE_BLENDSHAPES],
    requiredBones: [...DEFAULT_FACE_BONES],
    strict: true,
  };
}
