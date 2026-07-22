import { vec4, dot } from "./vec4.js";

export class Transform4D {
  constructor() {
    this.m = identity4x4();
  }

  static translate(tx, ty, tz, tw) {
    const t = new Transform4D();
    t.m[12] = tx; t.m[13] = ty; t.m[14] = tz; t.m[15] = tw;
    return t;
  }

  static scale(sx, sy, sz, sw) {
    const t = new Transform4D();
    t.m[0] = sx; t.m[5] = sy; t.m[10] = sz; t.m[15] = sw;
    return t;
  }

  static rotate(plane, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = new Transform4D();
    const idx = PLANE_MAP[plane];
    if (!idx) return t;
    const [i, j] = idx;
    t.m[i * 4 + i] = c;
    t.m[i * 4 + j] = -s;
    t.m[j * 4 + i] = s;
    t.m[j * 4 + j] = c;
    return t;
  }

  apply(v) {
    const m = this.m;
    const x = v.x, y = v.y, z = v.z, w = v.w;
    return vec4(
      m[0] * x + m[1] * y + m[2] * z + m[3] * w + m[12],
      m[4] * x + m[5] * y + m[6] * z + m[7] * w + m[13],
      m[8] * x + m[9] * y + m[10] * z + m[11] * w + m[14],
      m[12] * x + m[13] * y + m[14] * z + m[15] * w + m[15],
    );
  }

  applyDir(v) {
    const m = this.m;
    const x = v.x, y = v.y, z = v.z, w = v.w;
    return vec4(
      m[0] * x + m[1] * y + m[2] * z + m[3] * w,
      m[4] * x + m[5] * y + m[6] * z + m[7] * w,
      m[8] * x + m[9] * y + m[10] * z + m[11] * w,
      m[12] * x + m[13] * y + m[14] * z + m[15] * w,
    );
  }

  mul(other) {
    const r = new Transform4D();
    const a = this.m, b = other.m;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        r.m[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
      }
    }
    return r;
  }

  inverse() {
    const m = this.m;
    const inv = new Float64Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    let det = m[0] * inv[0] + m[4] * inv[1] + m[8] * inv[2] + m[12] * inv[3];
    if (Math.abs(det) < 1e-12) return null;
    det = 1 / det;
    const out = new Transform4D();
    for (let i = 0; i < 16; i++) out.m[i] = inv[i] * det;
    return out;
  }
}

const PLANE_MAP = {
  xy: [0, 1], xz: [0, 2], xw: [0, 3],
  yz: [1, 2], yw: [1, 3], zw: [2, 3],
};

function identity4x4() {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
