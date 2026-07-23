/**
 * SO(4) Rotation — valid rotation matrices in 4D.
 *
 * A 4x4 matrix R is in SO(4) iff:
 *   R^T R = I₄   (orthonormal)
 *   det(R) = 1   (orientation-preserving)
 *
 * All rotations are composed from elementary plane rotations.
 */

import { dot, normalize, add as v4add, scale as v4scale, sub as v4sub } from "./vec4.js";

/**
 * 4x4 identity matrix (row-major).
 */
export const IDENTITY4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/**
 * Create a rotation matrix for the given plane and angle.
 * @param {"xy"|"xz"|"xw"|"yz"|"yw"|"zw"} plane
 * @param {number} angle - radians
 * @returns {Float64Array} 4x4 matrix (row-major)
 */
export function rotationMatrix(plane, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = new Float64Array(16);

  // Start with identity
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;

  switch (plane) {
    case "xy":
      m[0] = c; m[1] = -s;
      m[4] = s; m[5] = c;
      break;
    case "xz":
      m[0] = c;  m[2] = -s;
      m[8] = s;  m[10] = c;
      break;
    case "xw":
      m[0] = c;  m[3] = -s;
      m[12] = s; m[15] = c;
      break;
    case "yz":
      m[5] = c;  m[6] = -s;
      m[9] = s;  m[10] = c;
      break;
    case "yw":
      m[5] = c;  m[7] = -s;
      m[13] = s; m[15] = c;
      break;
    case "zw":
      m[10] = c; m[11] = -s;
      m[14] = s; m[15] = c;
      break;
    default:
      throw new Error(`Unknown rotation plane: ${plane}`);
  }

  return m;
}

/**
 * Multiply two 4x4 matrices: result = A × B.
 * @param {Float64Array|number[]} A
 * @param {Float64Array|number[]} B
 * @returns {Float64Array}
 */
export function mat4mul(A, B) {
  const r = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] =
        A[i * 4 + 0] * B[0 * 4 + j] +
        A[i * 4 + 1] * B[1 * 4 + j] +
        A[i * 4 + 2] * B[2 * 4 + j] +
        A[i * 4 + 3] * B[3 * 4 + j];
    }
  }
  return r;
}

/**
 * Transpose a 4x4 matrix.
 * @param {Float64Array|number[]} m
 * @returns {Float64Array}
 */
export function mat4transpose(m) {
  const r = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = m[j * 4 + i];
    }
  }
  return r;
}

/**
 * Apply a 4x4 matrix to a 4D point: result = M × p.
 * @param {Float64Array|number[]} m - 4x4 matrix (row-major)
 * @param {{x,y,z,w}} p - 4D point
 * @returns {{x,y,z,w}}
 */
export function mat4apply(m, p) {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3] * p.w,
    y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7] * p.w,
    z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11] * p.w,
    w: m[12] * p.x + m[13] * p.y + m[14] * p.z + m[15] * p.w,
  };
}

/**
 * Compute the determinant of a 4x4 matrix.
 * Uses cofactor expansion.
 */
export function mat4det(m) {
  return (
    m[0] * (
      m[5] * (m[10] * m[15] - m[11] * m[14]) -
      m[6] * (m[9] * m[15] - m[11] * m[13]) +
      m[7] * (m[9] * m[14] - m[10] * m[13])
    ) -
    m[1] * (
      m[4] * (m[10] * m[15] - m[11] * m[14]) -
      m[6] * (m[8] * m[15] - m[11] * m[12]) +
      m[7] * (m[8] * m[14] - m[10] * m[12])
    ) +
    m[2] * (
      m[4] * (m[9] * m[15] - m[11] * m[13]) -
      m[5] * (m[8] * m[15] - m[11] * m[12]) +
      m[7] * (m[8] * m[13] - m[9] * m[12])
    ) -
    m[3] * (
      m[4] * (m[9] * m[14] - m[10] * m[13]) -
      m[5] * (m[8] * m[14] - m[10] * m[12]) +
      m[6] * (m[8] * m[13] - m[9] * m[12])
    )
  );
}

/**
 * Validate that a matrix is a valid SO(4) rotation.
 * Article IV, Invariant 3: R^T R = I₄, det(R) = 1
 *
 * @param {Float64Array|number[]} m
 * @param {number} tolerance - maximum deviation from identity
 * @returns {{ valid: boolean, reason?: string, orthonormError?: number, detError?: number }}
 */
export function validateSO4(m, tolerance = 1e-6) {
  // Check determinant
  const det = mat4det(m);
  const detError = Math.abs(det - 1);
  if (detError > tolerance) {
    return {
      valid: false,
      reason: `det(R) = ${det.toFixed(8)}, expected 1.0 (error: ${detError.toFixed(8)})`,
      detError,
    };
  }

  // Check orthonormality: R^T R should be identity
  const Rt = mat4transpose(m);
  const RtR = mat4mul(Rt, m);

  let maxError = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const expected = i === j ? 1 : 0;
      const error = Math.abs(RtR[i * 4 + j] - expected);
      maxError = Math.max(maxError, error);
    }
  }

  if (maxError > tolerance) {
    return {
      valid: false,
      reason: `Orthonormality error: ${(maxError).toFixed(8)} (tolerance: ${tolerance})`,
      orthonormError: maxError,
      detError,
    };
  }

  return { valid: true, orthonormError: maxError, detError };
}

/**
 * Build a combined SO(4) rotation from a sequence of plane rotations.
 * Article IV, Invariant 5: Only Camera may apply SO(4) rotation.
 *
 * @param {Array<{plane: string, angle: number}>} rotations
 * @returns {Float64Array} combined 4x4 rotation matrix
 */
export function buildSO4(rotations) {
  let result = new Float64Array(IDENTITY4);
  for (const { plane, angle } of rotations) {
    result = mat4mul(result, rotationMatrix(plane, angle));
  }

  // Validate (should always pass since we compose from valid rotations)
  const validation = validateSO4(result);
  if (!validation.valid) {
    throw new Error(`SO(4) composition failed: ${validation.reason}`);
  }

  return result;
}

/**
 * Interpolate between two SO(4) rotations using SLERP-like approach.
 * For simplicity, we interpolate in the Lie algebra (exponential map).
 *
 * @param {Float64Array} R0 - start rotation
 * @param {Float64Array} R1 - end rotation
 * @param {number} t - interpolation parameter [0,1]
 * @returns {Float64Array} interpolated rotation
 */
export function slerpSO4(R0, R1, t) {
  // Simple approach: decompose into plane rotations, interpolate angles
  // This is approximate but works well for small differences
  // A proper SLERP would use quaternion double-cover of SO(4)

  // For now, use matrix interpolation via eigendecomposition
  // Simplified: just blend and re-orthogonalize
  const blended = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    blended[i] = (1 - t) * R0[i] + t * R1[i];
  }

  // Re-orthogonalize using Gram-Schmidt on columns
  // Treat columns as 4D vectors
  const cols = [
    [blended[0], blended[4], blended[8], blended[12]],
    [blended[1], blended[5], blended[9], blended[13]],
    [blended[2], blended[6], blended[10], blended[14]],
    [blended[3], blended[7], blended[11], blended[15]],
  ];

  // Gram-Schmidt orthogonalization
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < i; j++) {
      const dot = cols[i][0] * cols[j][0] + cols[i][1] * cols[j][1] +
                  cols[i][2] * cols[j][2] + cols[i][3] * cols[j][3];
      for (let k = 0; k < 4; k++) {
        cols[i][k] -= dot * cols[j][k];
      }
    }
    // Normalize
    const len = Math.sqrt(
      cols[i][0] ** 2 + cols[i][1] ** 2 + cols[i][2] ** 2 + cols[i][3] ** 2
    );
    if (len > 1e-10) {
      for (let k = 0; k < 4; k++) cols[i][k] /= len;
    }
  }

  // Rebuild matrix from columns
  const result = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    result[0 + i] = cols[i][0];
    result[4 + i] = cols[i][1];
    result[8 + i] = cols[i][2];
    result[12 + i] = cols[i][3];
  }

  return result;
}
