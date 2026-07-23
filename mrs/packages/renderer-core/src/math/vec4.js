/**
 * 4D vector operations.
 * All vectors are plain objects: { x, y, z, w }.
 */

export function vec4(x, y, z, w) {
  return { x, y, z, w };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z, w: a.w + b.w };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z, w: a.w - b.w };
}

export function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s, w: v.w * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function length(v) {
  return Math.sqrt(dot(v, v));
}

export function normalize(v) {
  const len = length(v);
  if (len < 1e-10) return { x: 0, y: 0, z: 0, w: 0 };
  return scale(v, 1 / len);
}

export function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    w: a.w + (b.w - a.w) * t,
  };
}

export function cross4d(a, b, c) {
  // Generalized cross product: result is perpendicular to a, b, c
  // Using the formula: result_i = epsilon_ijkl * a_j * b_k * c_l
  // Computed via determinant expansion
  return {
    x:
      a.y * (b.z * c.w - b.w * c.z) -
      a.z * (b.y * c.w - b.w * c.y) +
      a.w * (b.y * c.z - b.z * c.y),
    y:
      -(a.x * (b.z * c.w - b.w * c.z)) +
      a.z * (b.x * c.w - b.w * c.x) -
      a.w * (b.x * c.z - b.z * c.x),
    z:
      a.x * (b.y * c.w - b.w * c.y) -
      a.y * (b.x * c.w - b.w * c.x) +
      a.w * (b.x * c.y - b.y * c.x),
    w:
      -(a.x * (b.y * c.z - b.z * c.y)) +
      a.y * (b.x * c.z - b.z * c.x) -
      a.z * (b.x * c.y - b.y * c.x),
  };
}

export function faceNormal4d(v0, v1, v2) {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  // Use cross product of first 3 components to get a pseudo-normal
  // For 4D faces, we use the 3D cross product of the projected edges
  const cross = {
    x: e1.y * e2.z - e1.z * e2.y,
    y: e1.z * e2.x - e1.x * e2.z,
    z: e1.x * e2.y - e1.y * e2.x,
    w: 0,
  };
  return normalize(cross);
}
