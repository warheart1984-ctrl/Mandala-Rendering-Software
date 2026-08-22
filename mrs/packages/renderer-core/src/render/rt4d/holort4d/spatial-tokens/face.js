/**
 * Face-mode helpers for spatial tokens.
 * Status: partial — landmark→region labels are heuristic, not mesh segmentation.
 */

/**
 * @typedef {object} FaceRigLike
 * @property {{ id?: number, x: number, y: number, z?: number, bone?: string }[]} landmarks
 */

/**
 * Build a minimal FaceRigLike from landmark-z chamber buffers.
 * @param {Float32Array|number[]} landmarkXYZ  packed x,y,z per landmark
 * @param {number} [count]
 * @returns {FaceRigLike}
 */
export function faceRigFromLandmarkXYZ(landmarkXYZ, count) {
  const n = count ?? Math.floor(landmarkXYZ.length / 3);
  /** @type {FaceRigLike['landmarks']} */
  const landmarks = [];
  for (let i = 0; i < n; i++) {
    landmarks.push({
      id: i,
      x: Number(landmarkXYZ[i * 3]),
      y: Number(landmarkXYZ[i * 3 + 1]),
      z: Number(landmarkXYZ[i * 3 + 2] ?? 0),
    });
  }
  return { landmarks };
}

export const FACE_OBJECT_STATUS = Object.freeze({
  labels: "partial",
  note: "Region labels from dlib-style landmark id bands / bone names. Not photoreal segmentation.",
});
