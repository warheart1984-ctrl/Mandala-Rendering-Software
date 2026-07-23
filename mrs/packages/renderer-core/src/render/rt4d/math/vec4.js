export const vec4 = (x = 0, y = 0, z = 0, w = 0) => ({ x, y, z, w });

export const add = (a, b) => vec4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
export const sub = (a, b) => vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
export const scale = (v, s) => vec4(v.x * s, v.y * s, v.z * s, v.w * s);
export const mul = (a, b) => vec4(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
export const len2 = (v) => dot(v, v);
export const length = (v) => Math.sqrt(len2(v));
export const normalize = (v) => { const l = length(v) || 1; return vec4(v.x / l, v.y / l, v.z / l, v.w / l); };
export const lerp = (a, b, t) => vec4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t);

export const abs = (v) => vec4(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w));
export const min = (a, b) => vec4(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.min(a.w, b.w));
export const max = (a, b) => vec4(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), Math.max(a.w, b.w));
export const neg = (v) => vec4(-v.x, -v.y, -v.z, -v.w);

export const cross4D = (a, b) => vec4(
  a.y * b.z - a.z * b.y,
  a.z * b.w - a.w * b.z,
  a.w * b.x - a.x * b.w,
  a.x * b.y - a.y * b.x,
);

export const toArray = (v) => [v.x, v.y, v.z, v.w];
export const fromArray = (a) => vec4(a[0], a[1], a[2], a[3]);

export const ZERO = vec4(0, 0, 0, 0);
export const ONE = vec4(1, 1, 1, 1);
export const UNIT_X = vec4(1, 0, 0, 0);
export const UNIT_Y = vec4(0, 1, 0, 0);
export const UNIT_Z = vec4(0, 0, 1, 0);
export const UNIT_W = vec4(0, 0, 0, 1);
