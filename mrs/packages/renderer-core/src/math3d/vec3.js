export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const add3 = (a, b) => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a, b) => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (v, scalar) => vec3(v.x * scalar, v.y * scalar, v.z * scalar);
export const neg3 = (v) => vec3(-v.x, -v.y, -v.z);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a, b) => vec3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const lengthSq3 = (v) => dot3(v, v);
export const length3 = (v) => Math.sqrt(lengthSq3(v));
export const normalize3 = (v) => {
  const length = length3(v);
  return length > 1e-12 ? scale3(v, 1 / length) : vec3();
};
export const lerp3 = (a, b, t) => vec3(
  a.x + (b.x - a.x) * t,
  a.y + (b.y - a.y) * t,
  a.z + (b.z - a.z) * t,
);
