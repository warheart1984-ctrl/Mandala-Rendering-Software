/**
 * Per-frame face pose (ENGINE3D_FACE_RIG_SCHEMA_v1.0).
 */

export interface FaceExpression {
  name: string;
  /** Weight in [0, 1]. */
  weight: number;
}

/**
 * Bone values are either:
 * - 16 floats (column-major mat4), or
 * - 3 floats (translation — composed into a translation matrix).
 */
export interface FacePoseFrame {
  time: number;
  bones: Record<string, number[]>;
  expressions: FaceExpression[];
}

export function emptyFacePose(time = 0): FacePoseFrame {
  return { time, bones: {}, expressions: [] };
}
