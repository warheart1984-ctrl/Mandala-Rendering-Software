import { vec4, normalize } from "../math/vec4.js";

function v3From(input, fallback = [0, 0, 0]) {
  if (Array.isArray(input)) return [input[0] ?? fallback[0], input[1] ?? fallback[1], input[2] ?? fallback[2]];
  if (input && typeof input === "object") return [input.x ?? fallback[0], input.y ?? fallback[1], input.z ?? fallback[2]];
  return fallback;
}

function pointAt(ray, t) {
  return vec4(
    ray.origin.x + t * ray.direction.x,
    ray.origin.y + t * ray.direction.y,
    ray.origin.z + t * ray.direction.z,
    ray.origin.w + t * ray.direction.w,
  );
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function length2(x, y, z = 0) {
  return Math.sqrt(x * x + y * y + z * z);
}

function sdCappedCylinder(p, radius, halfHeight) {
  const d0 = length2(p[0], p[2]) - radius;
  const d1 = Math.abs(p[1]) - halfHeight;
  return Math.min(Math.max(d0, d1), 0) + length2(Math.max(d0, 0), Math.max(d1, 0));
}

function sdCapsule(p, radius, halfHeight) {
  const y = Math.max(-halfHeight, Math.min(halfHeight, p[1]));
  return length2(p[0], p[1] - y, p[2]) - radius;
}

function sdCone(p, radius, halfHeight) {
  const y = Math.max(-halfHeight, Math.min(halfHeight, p[1]));
  const t = (y + halfHeight) / (2 * halfHeight || 1);
  const r = radius * (1 - t);
  const side = length2(p[0], p[2]) - r;
  const cap = Math.abs(p[1]) - halfHeight;
  return Math.min(Math.max(side, cap), 0) + length2(Math.max(side, 0), Math.max(cap, 0));
}

function sdTorus(p, majorRadius, minorRadius) {
  const qx = length2(p[0], p[2]) - majorRadius;
  return length2(qx, p[1]) - minorRadius;
}

function sdSuperquadric(p, radius, exponent) {
  const e = Math.max(0.1, exponent);
  const v = Math.pow(Math.abs(p[0] / radius), e) + Math.pow(Math.abs(p[1] / radius), e) + Math.pow(Math.abs(p[2] / radius), e);
  return (Math.pow(v, 1 / e) - 1) * radius;
}

export class SdfPrimitiveIntersector {
  constructor(primitive) {
    this.kind = primitive.kind;
    this.center = v3From(primitive.center ?? primitive.position, [0, 0, 0]);
    this.radius = finite(primitive.radius, 1);
    this.height = finite(primitive.height, 2);
    this.majorRadius = finite(primitive.majorRadius, 1);
    this.minorRadius = finite(primitive.minorRadius, 0.25);
    this.exponent = finite(primitive.exponent, 4);
    this.materialId = primitive.materialId ?? primitive.material?.id ?? "default";
    this.maxSteps = primitive.maxSteps ?? 128;
    this.epsilon = primitive.epsilon ?? 0.0008;
    this.maxDist = primitive.maxDist ?? 1e3;
  }

  _local(p) {
    return [p.x - this.center[0], p.y - this.center[1], p.z - this.center[2]];
  }

  _sdfLocal(p) {
    if (this.kind === "cylinder") return sdCappedCylinder(p, this.radius, this.height / 2);
    if (this.kind === "capsule") return sdCapsule(p, this.radius, this.height / 2);
    if (this.kind === "cone") return sdCone(p, this.radius, this.height / 2);
    if (this.kind === "torus") return sdTorus(p, this.majorRadius, this.minorRadius);
    if (this.kind === "superquadric") return sdSuperquadric(p, this.radius, this.exponent);
    return length2(p[0], p[1], p[2]) - this.radius;
  }

  sdf(worldPoint) {
    return this._sdfLocal(this._local(worldPoint));
  }

  getCenter() {
    return [this.center[0], this.center[1], this.center[2], 0];
  }

  getBounds() {
    const extent = this.kind === "torus"
      ? this.majorRadius + this.minorRadius
      : this.kind === "cylinder" || this.kind === "capsule" || this.kind === "cone"
        ? Math.max(this.radius, this.height / 2 + this.radius)
        : this.radius;
    return {
      min: vec4(this.center[0] - extent, this.center[1] - extent, this.center[2] - extent, -extent),
      max: vec4(this.center[0] + extent, this.center[1] + extent, this.center[2] + extent, extent),
    };
  }

  intersect(ray) {
    let t = ray.tMin ?? 0.001;
    const maxT = Math.min(ray.tMax ?? this.maxDist, this.maxDist);
    for (let i = 0; i < this.maxSteps && t <= maxT; i++) {
      const p = pointAt(ray, t);
      const d = this.sdf(p);
      if (Math.abs(d) <= this.epsilon) {
        return { t, position: p, normal: this._normal(p), materialId: this.materialId };
      }
      t += Math.max(Math.abs(d), this.epsilon);
    }
    return null;
  }

  _normal(p) {
    const e = 0.001;
    const nx = this.sdf(vec4(p.x + e, p.y, p.z, p.w)) - this.sdf(vec4(p.x - e, p.y, p.z, p.w));
    const ny = this.sdf(vec4(p.x, p.y + e, p.z, p.w)) - this.sdf(vec4(p.x, p.y - e, p.z, p.w));
    const nz = this.sdf(vec4(p.x, p.y, p.z + e, p.w)) - this.sdf(vec4(p.x, p.y, p.z - e, p.w));
    return normalize(vec4(nx, ny, nz, 0));
  }
}

export function wrapPrimitiveIntersector(primitive, materialId) {
  if (typeof primitive.intersect === "function") return primitive;
  if (["cylinder", "capsule", "cone", "torus", "superquadric"].includes(primitive.kind)) {
    const intersector = new SdfPrimitiveIntersector({ ...primitive, materialId });
    primitive.intersect = (ray) => intersector.intersect(ray);
    primitive.getBounds = () => intersector.getBounds();
    primitive.getCenter = () => intersector.getCenter();
  }
  return primitive;
}
