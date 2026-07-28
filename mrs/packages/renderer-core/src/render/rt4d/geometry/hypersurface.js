import { vec4, dot, length, normalize, sub } from "../math/vec4.js";

export class Hypersphere {
  constructor(center, radius) {
    this.center = vec4(center.x, center.y, center.z, center.w);
    this.radius = radius;
  }

  getCenter() {
    const c = this.center;
    return [c.x, c.y, c.z, c.w];
  }

  getBounds() {
    const c = this.center;
    const r = this.radius;
    return {
      min: vec4(c.x - r, c.y - r, c.z - r, c.w - r),
      max: vec4(c.x + r, c.y + r, c.z + r, c.w + r),
    };
  }

  intersect(ray) {
    const oc = sub(ray.origin, this.center);
    const a = dot(ray.direction, ray.direction);
    const b = 2 * dot(oc, ray.direction);
    const c = dot(oc, oc) - this.radius * this.radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    if (t1 > ray.tMin && t1 < ray.tMax) return this._makeHit(ray, t1);
    if (t2 > ray.tMin && t2 < ray.tMax) return this._makeHit(ray, t2);
    return null;
  }

  _makeHit(ray, t) {
    const pos = vec4(
      ray.origin.x + t * ray.direction.x,
      ray.origin.y + t * ray.direction.y,
      ray.origin.z + t * ray.direction.z,
      ray.origin.w + t * ray.direction.w,
    );
    const n = normalize(sub(pos, this.center));
    return { t, position: pos, normal: n, materialId: this.materialId ?? "default" };
  }
}

export class Hyperplane {
  constructor(normal, offset) {
    this.normal = normalize(normal);
    this.offset = offset;
  }

  getCenter() {
    const n = this.normal;
    return [n.x * this.offset, n.y * this.offset, n.z * this.offset, n.w * this.offset];
  }

  /** Finite BVH proxy: thin slab along the normal, large extent tangentially. */
  getBounds() {
    const n = this.normal;
    const p = this.getCenter();
    const extent = 8;
    const thick = 0.05;
    return {
      min: vec4(
        p[0] - extent * (1 - Math.abs(n.x)) - thick * Math.abs(n.x),
        p[1] - extent * (1 - Math.abs(n.y)) - thick * Math.abs(n.y),
        p[2] - extent * (1 - Math.abs(n.z)) - thick * Math.abs(n.z),
        p[3] - extent * (1 - Math.abs(n.w)) - thick * Math.abs(n.w),
      ),
      max: vec4(
        p[0] + extent * (1 - Math.abs(n.x)) + thick * Math.abs(n.x),
        p[1] + extent * (1 - Math.abs(n.y)) + thick * Math.abs(n.y),
        p[2] + extent * (1 - Math.abs(n.z)) + thick * Math.abs(n.z),
        p[3] + extent * (1 - Math.abs(n.w)) + thick * Math.abs(n.w),
      ),
    };
  }

  intersect(ray) {
    const ndotDir = dot(this.normal, ray.direction);
    if (Math.abs(ndotDir) < 1e-9) return null;
    const t = (this.offset - dot(this.normal, ray.origin)) / ndotDir;
    if (t < ray.tMin || t > ray.tMax) return null;
    const pos = vec4(
      ray.origin.x + t * ray.direction.x,
      ray.origin.y + t * ray.direction.y,
      ray.origin.z + t * ray.direction.z,
      ray.origin.w + t * ray.direction.w,
    );
    return { t, position: pos, normal: this.normal, materialId: this.materialId ?? "default" };
  }
}

export class OrientedCapsule {
  constructor(pointA, pointB, radius) {
    this.a = vec4(pointA.x, pointA.y, pointA.z, pointA.w);
    this.b = vec4(pointB.x, pointB.y, pointB.z, pointB.w);
    this.radius = radius;
    this.axis = sub(this.b, this.a);
    this.bb = dot(this.axis, this.axis);
    this._capA = new Hypersphere(this.a, radius);
    this._capB = new Hypersphere(this.b, radius);
  }

  getCenter() {
    const c = vec4((this.a.x + this.b.x) / 2, (this.a.y + this.b.y) / 2, (this.a.z + this.b.z) / 2, (this.a.w + this.b.w) / 2);
    return [c.x, c.y, c.z, c.w];
  }

  getBounds() {
    const r = this.radius;
    return {
      min: vec4(Math.min(this.a.x, this.b.x) - r, Math.min(this.a.y, this.b.y) - r, Math.min(this.a.z, this.b.z) - r, Math.min(this.a.w, this.b.w) - r),
      max: vec4(Math.max(this.a.x, this.b.x) + r, Math.max(this.a.y, this.b.y) + r, Math.max(this.a.z, this.b.z) + r, Math.max(this.a.w, this.b.w) + r),
    };
  }

  intersect(ray) {
    const O = ray.origin;
    const D = ray.direction;
    const A = this.a;
    const BA = this.axis;
    const OA = sub(O, A);
    const dd = dot(D, D);
    const bd = dot(BA, D);
    const od = dot(OA, D);
    const ob = dot(OA, BA);
    const oo = dot(OA, OA);
    const bb = this.bb;
    const Aq = dd * bb - bd * bd;
    if (Aq === 0) return this._intersectCaps(ray);
    const Bq = 2 * (od * bb - ob * bd);
    const Cq = oo * bb - ob * ob - this.radius * this.radius * bb;
    let disc = Bq * Bq - 4 * Aq * Cq;
    if (disc < 0) return this._intersectCaps(ray);
    disc = Math.sqrt(disc);
    for (const t of [(-Bq - disc) / (2 * Aq), (-Bq + disc) / (2 * Aq)]) {
      if (t < ray.tMin || t > ray.tMax) continue;
      const s = (ob + t * bd) / bb;
      if (s >= 0 && s <= 1) {
        const pos = vec4(O.x + t * D.x, O.y + t * D.y, O.z + t * D.z, O.w + t * D.w);
        const cp = vec4(A.x + s * BA.x, A.y + s * BA.y, A.z + s * BA.z, A.w + s * BA.w);
        return { t, position: pos, normal: normalize(sub(pos, cp)), materialId: this.materialId ?? "default" };
      }
    }
    return this._intersectCaps(ray);
  }

  _intersectCaps(ray) {
    const hitA = this._capA.intersect(ray);
    const tA = hitA ? hitA.t : Infinity;
    const hitB = this._capB.intersect(ray);
    const tB = hitB ? hitB.t : Infinity;
    const hit = tA < tB ? hitA : hitB;
    if (hit) hit.materialId = this.materialId ?? "default";
    return hit;
  }
}

export class ImplicitHypersurface {
  constructor(sdf, options = {}) {
    this.sdf = sdf;
    this.maxSteps = options.maxSteps ?? 128;
    this.epsilon = options.epsilon ?? 0.001;
    this.maxDist = options.maxDist ?? 100;
  }

  intersect(ray) {
    let t = ray.tMin;
    for (let i = 0; i < this.maxSteps; i++) {
      const p = vec4(
        ray.origin.x + t * ray.direction.x,
        ray.origin.y + t * ray.direction.y,
        ray.origin.z + t * ray.direction.z,
        ray.origin.w + t * ray.direction.w,
      );
      const d = this.sdf(p);
      if (Math.abs(d) < this.epsilon) {
        const n = this._estimateNormal(p);
        return { t, position: p, normal: n, materialId: this.materialId ?? "default" };
      }
      t += d;
      if (t > ray.tMax) break;
    }
    return null;
  }

  _estimateNormal(p, eps = 0.001) {
    const cx = this.sdf(vec4(p.x + eps, p.y, p.z, p.w)) - this.sdf(vec4(p.x - eps, p.y, p.z, p.w));
    const cy = this.sdf(vec4(p.x, p.y + eps, p.z, p.w)) - this.sdf(vec4(p.x, p.y - eps, p.z, p.w));
    const cz = this.sdf(vec4(p.x, p.y, p.z + eps, p.w)) - this.sdf(vec4(p.x, p.y, p.z - eps, p.w));
    const cw = this.sdf(vec4(p.x, p.y, p.z, p.w + eps)) - this.sdf(vec4(p.x, p.y, p.z, p.w - eps));
    return normalize(vec4(cx, cy, cz, cw));
  }
}
