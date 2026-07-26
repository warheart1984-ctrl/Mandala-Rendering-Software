import { add, cross4D, dot, normalize, scale, sub, vec4 } from "../math/vec4.js";
import { buildDynamicBvh, traverseDynamicBvh } from "./DynamicBvh.js";

const sharedBvhCache = new Map();

function bvhCacheKey(primitive) {
  return primitive.localBvhKey
    ?? primitive.bvhKey
    ?? primitive.evidence?.bakedGeometryHash
    ?? primitive.evidence?.meshDeformationHash
    ?? null;
}

export function clearSharedMeshBvhCache() {
  sharedBvhCache.clear();
}

export function sharedMeshBvhCacheSize() {
  return sharedBvhCache.size;
}

function readVec(vertices, index, stride = 3) {
  if (Array.isArray(vertices[index])) {
    const v = vertices[index];
    return vec4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
  }
  const o = index * stride;
  return vec4(vertices[o] ?? 0, vertices[o + 1] ?? 0, vertices[o + 2] ?? 0, stride > 3 ? vertices[o + 3] ?? 0 : 0);
}

function readAttr(values, index, fallback, stride = 3) {
  if (!values) return fallback;
  return readVec(values, index, stride);
}

function interpolate(a, b, c, u, v) {
  const w = 1 - u - v;
  return add(add(scale(a, w), scale(b, u)), scale(c, v));
}

export function generateTriangleNormal(v0, v1, v2) {
  return normalize(cross4D(sub(v1, v0), sub(v2, v0), vec4(0, 0, 0, 1)));
}

function cross3(a, b) {
  return vec4(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
    0,
  );
}

function transformPoint3(m, p) {
  if (!m) return p;
  const x = p.x, y = p.y, z = p.z;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  const invW = Math.abs(w) > 1e-12 ? 1 / w : 1;
  return vec4(
    (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW,
    p.w ?? 0,
  );
}

function transformVector3(m, p) {
  if (!m) return p;
  const x = p.x, y = p.y, z = p.z;
  return vec4(
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
    p.w ?? 0,
  );
}

function lengthSafe(v) {
  return Math.hypot(v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0);
}

export class SkinnedMeshIntersector {
  constructor(primitive, options = {}) {
    this.primitive = primitive;
    this.vertices = primitive.localVertices ?? primitive.vertices ?? [];
    this.indices = primitive.localIndices ?? primitive.indices ?? [];
    this.normals = primitive.localNormals ?? primitive.normals ?? null;
    this.tangents = primitive.tangents ?? null;
    this.uvs = primitive.uvs ?? null;
    this.localToWorld = primitive.instanceMatrix ?? null;
    this.worldToLocal = primitive.inverseInstanceMatrix ?? null;
    this.usesLocalInstanceTraversal = Boolean(primitive.localVertices && primitive.instanceMatrix && primitive.inverseInstanceMatrix);
    this.materialSlots = primitive.materialSlots ?? null;
    this.defaultMaterialId = primitive.materialId ?? primitive.material?.id ?? "default";
    this.bvhKey = bvhCacheKey(primitive);
    this.bvh = this._buildOrReuseBvh(options);
  }

  refit(primitive = this.primitive) {
    this.primitive = primitive;
    this.vertices = primitive.localVertices ?? primitive.vertices ?? [];
    this.indices = primitive.localIndices ?? primitive.indices ?? [];
    this.bvhKey = bvhCacheKey(primitive);
    this.bvh = this._buildOrReuseBvh();
    return this;
  }

  _buildOrReuseBvh(options = {}) {
    if (!this.bvhKey) return buildDynamicBvh(this.vertices, this.indices, options);
    const cached = sharedBvhCache.get(this.bvhKey);
    if (cached) return cached;
    const bvh = buildDynamicBvh(this.vertices, this.indices, options);
    sharedBvhCache.set(this.bvhKey, bvh);
    return bvh;
  }

  intersect(ray) {
    const localRay = this.usesLocalInstanceTraversal
      ? {
          ...ray,
          origin: transformPoint3(this.worldToLocal, ray.origin),
          direction: normalize(transformVector3(this.worldToLocal, ray.direction)),
        }
      : ray;
    const hit = traverseDynamicBvh(this.bvh, localRay, (tri) => this._intersectTriangle(localRay, tri));
    if (!hit || !this.usesLocalInstanceTraversal) return hit;
    const worldPosition = transformPoint3(this.localToWorld, hit.position);
    const worldNormal = normalize(transformVector3(this.localToWorld, hit.normal));
    return {
      ...hit,
      position: worldPosition,
      normal: worldNormal,
      geometricNormal: normalize(transformVector3(this.localToWorld, hit.geometricNormal)),
      t: lengthSafe(sub(worldPosition, ray.origin)),
      traversalSpace: "local-instance",
    };
  }

  _intersectTriangle(ray, tri) {
    const [i0, i1, i2] = tri.indices;
    const v0 = readVec(this.vertices, i0);
    const v1 = readVec(this.vertices, i1);
    const v2 = readVec(this.vertices, i2);
    const e1 = sub(v1, v0);
    const e2 = sub(v2, v0);
    const p = cross3(ray.direction, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-9) return null;
    const invDet = 1 / det;
    const tv = sub(ray.origin, v0);
    const u = dot(tv, p) * invDet;
    if (u < 0 || u > 1) return null;
    const q = cross3(tv, e1);
    const v = dot(ray.direction, q) * invDet;
    if (v < 0 || u + v > 1) return null;
    const t = dot(e2, q) * invDet;
    if (t < (ray.tMin ?? 0) || t > (ray.tMax ?? 1e9)) return null;

    const geometricNormal = generateTriangleNormal(v0, v1, v2);
    const n0 = readAttr(this.normals, i0, geometricNormal);
    const n1 = readAttr(this.normals, i1, geometricNormal);
    const n2 = readAttr(this.normals, i2, geometricNormal);
    const tangent = this.tangents
      ? normalize(interpolate(readVec(this.tangents, i0, 4), readVec(this.tangents, i1, 4), readVec(this.tangents, i2, 4), u, v))
      : normalize(e1);
    const materialId = this.materialSlots?.[tri.triangleIndex] ?? this.defaultMaterialId;

    return {
      t,
      position: vec4(
        ray.origin.x + ray.direction.x * t,
        ray.origin.y + ray.direction.y * t,
        ray.origin.z + ray.direction.z * t,
        ray.origin.w + ray.direction.w * t,
      ),
      normal: normalize(interpolate(n0, n1, n2, u, v)),
      geometricNormal,
      tangent,
      uv: this._interpolateUv(i0, i1, i2, u, v),
      barycentric: [1 - u - v, u, v],
      triangleIndex: tri.triangleIndex,
      materialId,
      primitiveKind: this.primitive.kind ?? "skinned-mesh",
    };
  }

  _interpolateUv(i0, i1, i2, u, v) {
    if (!this.uvs) return null;
    const read = (i) => {
      if (Array.isArray(this.uvs[i])) return [this.uvs[i][0] ?? 0, this.uvs[i][1] ?? 0];
      const o = i * 2;
      return [this.uvs[o] ?? 0, this.uvs[o + 1] ?? 0];
    };
    const a = read(i0), b = read(i1), c = read(i2);
    const w = 1 - u - v;
    return [a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v];
  }
}
