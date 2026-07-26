import type { Mat4Tuple } from "./HumanRigTypes.js";

export const IDENTITY_MAT4: Mat4Tuple = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function mat4(values?: ArrayLike<number> | null): Mat4Tuple {
  if (!values) return IDENTITY_MAT4;
  if (values.length !== 16) throw new Error(`Expected 16 matrix values, got ${values.length}`);
  return Array.from(values, Number) as unknown as Mat4Tuple;
}

export function multiplyMat4(a: Mat4Tuple, b: Mat4Tuple): Mat4Tuple {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        const index = column * 4 + row;
        out[index] = (out[index] ?? 0) + a[k * 4 + row]! * b[column * 4 + k]!;
      }
    }
  }
  return out as unknown as Mat4Tuple;
}

export function transformPoint(matrix: Mat4Tuple, x: number, y: number, z: number): [number, number, number] {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const invW = Math.abs(w) > 1e-12 ? 1 / w : 1;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * invW,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * invW,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * invW,
  ];
}

export function transformVector(matrix: Mat4Tuple, x: number, y: number, z: number): [number, number, number] {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z,
  ];
}

export function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
