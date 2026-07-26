import { vec3 } from "./vec3.js";

/** Column-major matrices operating on column vectors. */
export const identityMat4 = () => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export const translationMat4 = (v) => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  v.x, v.y, v.z, 1,
];

export const scaleMat4 = (v) => [
  v.x, 0, 0, 0,
  0, v.y, 0, 0,
  0, 0, v.z, 0,
  0, 0, 0, 1,
];

export function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }
  return out;
}

export function applyMat4ToPoint(matrix, point) {
  const x = point.x, y = point.y, z = point.z;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const inverseW = Math.abs(w) > 1e-12 ? 1 / w : 1;
  return vec3(
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * inverseW,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * inverseW,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * inverseW,
  );
}

export const applyMat4ToVector = (matrix, vector) => vec3(
  matrix[0] * vector.x + matrix[4] * vector.y + matrix[8] * vector.z,
  matrix[1] * vector.x + matrix[5] * vector.y + matrix[9] * vector.z,
  matrix[2] * vector.x + matrix[6] * vector.y + matrix[10] * vector.z,
);

export function applyMat4ToVec4(matrix, vector) {
  return {
    x: matrix[0] * vector.x + matrix[4] * vector.y + matrix[8] * vector.z + matrix[12] * vector.w,
    y: matrix[1] * vector.x + matrix[5] * vector.y + matrix[9] * vector.z + matrix[13] * vector.w,
    z: matrix[2] * vector.x + matrix[6] * vector.y + matrix[10] * vector.z + matrix[14] * vector.w,
    w: matrix[3] * vector.x + matrix[7] * vector.y + matrix[11] * vector.z + matrix[15] * vector.w,
  };
}

export const perspectiveMat4 = (fovYRadians, aspect, near, far) => {
  const f = 1 / Math.tan(fovYRadians / 2);
  const rangeInverse = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * rangeInverse, -1,
    0, 0, 2 * far * near * rangeInverse, 0,
  ];
};
