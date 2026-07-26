import { vec4 } from "../math/vec4.js";

function readVertex(vertices, index) {
  if (Array.isArray(vertices[index])) {
    const v = vertices[index];
    return vec4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
  }
  const o = index * 3;
  return vec4(vertices[o] ?? 0, vertices[o + 1] ?? 0, vertices[o + 2] ?? 0, 0);
}

function triangleBounds(vertices, i0, i1, i2) {
  const a = readVertex(vertices, i0);
  const b = readVertex(vertices, i1);
  const c = readVertex(vertices, i2);
  return {
    min: vec4(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z), Math.min(a.w, b.w, c.w)),
    max: vec4(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z), Math.max(a.w, b.w, c.w)),
  };
}

function unionBounds(items) {
  const min = vec4(Infinity, Infinity, Infinity, Infinity);
  const max = vec4(-Infinity, -Infinity, -Infinity, -Infinity);
  for (const item of items) {
    min.x = Math.min(min.x, item.bounds.min.x);
    min.y = Math.min(min.y, item.bounds.min.y);
    min.z = Math.min(min.z, item.bounds.min.z);
    min.w = Math.min(min.w, item.bounds.min.w);
    max.x = Math.max(max.x, item.bounds.max.x);
    max.y = Math.max(max.y, item.bounds.max.y);
    max.z = Math.max(max.z, item.bounds.max.z);
    max.w = Math.max(max.w, item.bounds.max.w);
  }
  return { min, max };
}

function centroid(item, axis) {
  return (item.bounds.min[axis] + item.bounds.max[axis]) * 0.5;
}

function chooseAxis(bounds) {
  const extents = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
    w: bounds.max.w - bounds.min.w,
  };
  return Object.keys(extents).sort((a, b) => extents[b] - extents[a])[0];
}

export function intersectAabb(bounds, ray) {
  let tMin = ray.tMin ?? 0;
  let tMax = ray.tMax ?? 1e9;
  for (const axis of ["x", "y", "z", "w"]) {
    const origin = ray.origin[axis] ?? 0;
    const direction = ray.direction[axis] ?? 0;
    if (Math.abs(direction) < 1e-12) {
      if (origin < bounds.min[axis] || origin > bounds.max[axis]) return false;
      continue;
    }
    let t0 = (bounds.min[axis] - origin) / direction;
    let t1 = (bounds.max[axis] - origin) / direction;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) return false;
  }
  return true;
}

export function buildDynamicBvh(vertices, indices, options = {}) {
  const leafSize = options.leafSize ?? 4;
  const triangles = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
    triangles.push({ triangleIndex: i / 3, indices: [i0, i1, i2], bounds: triangleBounds(vertices, i0, i1, i2) });
  }

  function build(items) {
    const bounds = unionBounds(items);
    if (items.length <= leafSize) return { bounds, triangles: items, left: null, right: null };
    const axis = chooseAxis(bounds);
    const sorted = items.slice().sort((a, b) => centroid(a, axis) - centroid(b, axis));
    const mid = Math.floor(sorted.length / 2);
    return {
      bounds,
      triangles: null,
      left: build(sorted.slice(0, mid)),
      right: build(sorted.slice(mid)),
    };
  }

  return triangles.length > 0 ? build(triangles) : null;
}

export function traverseDynamicBvh(node, ray, testTriangle) {
  if (!node || !intersectAabb(node.bounds, ray)) return null;
  if (node.triangles) {
    let closest = null;
    for (const tri of node.triangles) {
      const hit = testTriangle(tri);
      if (hit && (!closest || hit.t < closest.t)) closest = hit;
    }
    return closest;
  }
  const left = traverseDynamicBvh(node.left, ray, testTriangle);
  const right = traverseDynamicBvh(node.right, ray, testTriangle);
  if (!left) return right;
  if (!right) return left;
  return left.t <= right.t ? left : right;
}
