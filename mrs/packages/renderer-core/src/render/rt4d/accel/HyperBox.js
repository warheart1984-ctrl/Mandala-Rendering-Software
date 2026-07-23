import { vec4, min, max, dot } from "../math/vec4.js";

export class HyperBox {
  constructor() {
    this.min = vec4(Infinity, Infinity, Infinity, Infinity);
    this.max = vec4(-Infinity, -Infinity, -Infinity, -Infinity);
  }

  expand(point) {
    this.min = min(this.min, point);
    this.max = max(this.max, point);
  }

  expandBox(other) {
    this.min = min(this.min, other.min);
    this.max = max(this.max, other.max);
  }

  surfaceArea() {
    const dx = this.max.x - this.min.x;
    const dy = this.max.y - this.min.y;
    const dz = this.max.z - this.min.z;
    const dw = this.max.w - this.min.w;
    return 2 * (dx * dy * dz + dx * dy * dw + dx * dz * dw + dy * dz * dw);
  }

  intersect(ray) {
    let tMin = -Infinity, tMax = Infinity;
    const origins = [ray.origin.x, ray.origin.y, ray.origin.z, ray.origin.w];
    const dirs = [ray.direction.x, ray.direction.y, ray.direction.z, ray.direction.w];
    const mins = [this.min.x, this.min.y, this.min.z, this.min.w];
    const maxs = [this.max.x, this.max.y, this.max.z, this.max.w];

    for (let i = 0; i < 4; i++) {
      const invD = 1 / (Math.abs(dirs[i]) > 1e-12 ? dirs[i] : 1e-12);
      let t0 = (mins[i] - origins[i]) * invD;
      let t1 = (maxs[i] - origins[i]) * invD;
      if (invD < 0) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMax <= tMin) return false;
    }
    return tMax > 0 && tMax > ray.tMin;
  }
}
