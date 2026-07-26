import { dot3, normalize3 } from "./vec3.js";

export const identityQuat = () => ({ x: 0, y: 0, z: 0, w: 1 });

export function quatFromAxisAngle(axis, radians) {
  const unit = normalize3(axis);
  const half = radians / 2;
  const sine = Math.sin(half);
  return normalizeQuat({ x: unit.x * sine, y: unit.y * sine, z: unit.z * sine, w: Math.cos(half) });
}

export const mulQuat = (a, b) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export function normalizeQuat(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return length > 1e-12
    ? { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length }
    : identityQuat();
}

export function quatToMat4(quaternion) {
  const q = normalizeQuat(quaternion);
  const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ];
}

/**
 * Intrinsic XYZ Euler convention: rotate around local X, then Y, then Z.
 * Equivalent matrix composition is Rz * Ry * Rx for column vectors.
 */
export function eulerToQuat(xRadians, yRadians, zRadians) {
  const qx = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, xRadians);
  const qy = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, yRadians);
  const qz = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, zRadians);
  return normalizeQuat(mulQuat(qz, mulQuat(qy, qx)));
}

export function slerpQuat(a, b, t) {
  let end = normalizeQuat(b);
  const start = normalizeQuat(a);
  let cosine = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;
  if (cosine < 0) {
    end = { x: -end.x, y: -end.y, z: -end.z, w: -end.w };
    cosine = -cosine;
  }
  if (cosine > 0.9995) {
    return normalizeQuat({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t,
      w: start.w + (end.w - start.w) * t,
    });
  }
  const theta = Math.acos(Math.min(1, cosine));
  const sine = Math.sin(theta);
  const aWeight = Math.sin((1 - t) * theta) / sine;
  const bWeight = Math.sin(t * theta) / sine;
  return {
    x: start.x * aWeight + end.x * bWeight,
    y: start.y * aWeight + end.y * bWeight,
    z: start.z * aWeight + end.z * bWeight,
    w: start.w * aWeight + end.w * bWeight,
  };
}

export const quatForwardSimilarity = (a, b) => dot3(
  { x: a.x, y: a.y, z: a.z },
  { x: b.x, y: b.y, z: b.z },
);
