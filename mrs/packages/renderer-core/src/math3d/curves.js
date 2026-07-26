import { add3, scale3, vec3 } from "./vec3.js";

export function bezier3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return add3(
    add3(scale3(p0, u ** 3), scale3(p1, 3 * u * u * t)),
    add3(scale3(p2, 3 * u * t * t), scale3(p3, t ** 3)),
  );
}

export function catmullRom3(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return vec3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}
