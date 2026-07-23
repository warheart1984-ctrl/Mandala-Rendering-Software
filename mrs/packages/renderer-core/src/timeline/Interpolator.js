export const Interpolator = {
  linear(a, b, t) {
    return a + (b - a) * t;
  },

  vector(a, b, t) {
    return a.map((v, i) => v + (b[i] - v) * t);
  },

  vector4(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t,
    ];
  },

  quaternion(a, b, t) {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (dot < 0) {
      b = [-b[0], -b[1], -b[2], -b[3]];
      dot = -dot;
    }
    if (dot > 0.9995) return this.vector4(a, b, t);
    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinT = Math.sin(theta);
    const sinT0 = Math.sin(theta0);
    const s0 = Math.cos(theta) - dot * sinT / sinT0;
    const s1 = sinT / sinT0;
    return [s0 * a[0] + s1 * b[0], s0 * a[1] + s1 * b[1], s0 * a[2] + s1 * b[2], s0 * a[3] + s1 * b[3]];
  },

  rotation4D(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  },

  color(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },

  easing(t, mode) {
    switch (mode) {
      case "linear": return t;
      case "easeIn": return t * t;
      case "easeOut": return t * (2 - t);
      case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case "easeInCubic": return t * t * t;
      case "easeOutCubic": return (--t) * t * t + 1;
      case "easeInOutCubic": return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
      case "smoothstep": return t * t * (3 - 2 * t);
      case "smootherstep": return t * t * t * (t * (t * 6 - 15) + 10);
      default: return t;
    }
  },

  dispatch(key, a, b, t, easing) {
    const et = this.easing(t, easing);
    const fn = this[key] || this.linear;
    if (key === "linear" || key === "easing") return fn(a, b, et);
    if (typeof fn === "function") return fn(a, b, et);
    return this.vector(a, b, et);
  },
};
