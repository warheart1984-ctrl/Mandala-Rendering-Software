import {
  add3, cross3, dot3, length3, lengthSq3, normalize3, scale3, sub3, vec3,
} from "./vec3.js";

export class Ray3D {
  constructor(origin = vec3(), direction = vec3(0, 0, -1), tMin = 0, tMax = Infinity) {
    this.origin = origin;
    this.direction = normalize3(direction);
    this.tMin = tMin;
    this.tMax = tMax;
  }

  at(t) {
    return add3(this.origin, scale3(this.direction, t));
  }
}

export class Plane3D {
  constructor(normal = vec3(0, 1, 0), constant = 0) {
    this.normal = normalize3(normal);
    this.constant = constant;
  }

  static fromPointNormal(point, normal) {
    const unit = normalize3(normal);
    return new Plane3D(unit, -dot3(unit, point));
  }

  distanceToPoint(point) {
    return dot3(this.normal, point) + this.constant;
  }
}

export function intersectRayPlane(ray, plane, epsilon = 1e-9) {
  const denominator = dot3(plane.normal, ray.direction);
  if (Math.abs(denominator) <= epsilon) return null;
  const t = -(dot3(plane.normal, ray.origin) + plane.constant) / denominator;
  if (t < ray.tMin || t > ray.tMax) return null;
  return { t, point: ray.at(t), normal: plane.normal };
}

export function aabbFromPoints(points) {
  if (points.length === 0) return { min: vec3(Infinity, Infinity, Infinity), max: vec3(-Infinity, -Infinity, -Infinity) };
  const min = vec3(Infinity, Infinity, Infinity);
  const max = vec3(-Infinity, -Infinity, -Infinity);
  for (const point of points) {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  }
  return { min, max };
}

export const aabbContains = (bounds, point) => (
  point.x >= bounds.min.x && point.x <= bounds.max.x
  && point.y >= bounds.min.y && point.y <= bounds.max.y
  && point.z >= bounds.min.z && point.z <= bounds.max.z
);

export const aabbOverlap = (a, b) => (
  a.min.x <= b.max.x && a.max.x >= b.min.x
  && a.min.y <= b.max.y && a.max.y >= b.min.y
  && a.min.z <= b.max.z && a.max.z >= b.min.z
);

export function sphereFromPoints(points) {
  if (points.length === 0) return { center: vec3(), radius: 0 };
  const bounds = aabbFromPoints(points);
  const center = scale3(add3(bounds.min, bounds.max), 0.5);
  let radiusSquared = 0;
  for (const point of points) radiusSquared = Math.max(radiusSquared, lengthSq3(sub3(point, center)));
  return { center, radius: Math.sqrt(radiusSquared) };
}

export class Frustum3D {
  constructor(planes = []) {
    this.planes = planes;
  }
}

export function aabbInFrustum(bounds, frustum) {
  for (const plane of frustum.planes) {
    const positive = vec3(
      plane.normal.x >= 0 ? bounds.max.x : bounds.min.x,
      plane.normal.y >= 0 ? bounds.max.y : bounds.min.y,
      plane.normal.z >= 0 ? bounds.max.z : bounds.min.z,
    );
    if (plane.distanceToPoint(positive) < 0) return false;
  }
  return true;
}

export function rayAABB(ray, bounds) {
  let tEnter = ray.tMin;
  let tExit = ray.tMax;
  for (const axis of ["x", "y", "z"]) {
    const direction = ray.direction[axis];
    if (Math.abs(direction) <= 1e-12) {
      if (ray.origin[axis] < bounds.min[axis] || ray.origin[axis] > bounds.max[axis]) return null;
      continue;
    }
    let near = (bounds.min[axis] - ray.origin[axis]) / direction;
    let far = (bounds.max[axis] - ray.origin[axis]) / direction;
    if (near > far) [near, far] = [far, near];
    tEnter = Math.max(tEnter, near);
    tExit = Math.min(tExit, far);
    if (tEnter > tExit) return null;
  }
  return { t: tEnter, tExit, point: ray.at(tEnter) };
}

export function raySphere(ray, sphere) {
  const offset = sub3(ray.origin, sphere.center);
  const b = dot3(offset, ray.direction);
  const c = dot3(offset, offset) - sphere.radius * sphere.radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  let t = -b - root;
  if (t < ray.tMin) t = -b + root;
  if (t < ray.tMin || t > ray.tMax) return null;
  const point = ray.at(t);
  return { t, point, normal: normalize3(sub3(point, sphere.center)) };
}

export function sphereSphere(a, b) {
  const delta = sub3(b.center, a.center);
  const distance = length3(delta);
  const penetration = a.radius + b.radius - distance;
  if (penetration < 0) return null;
  return { normal: distance > 1e-12 ? scale3(delta, 1 / distance) : vec3(1, 0, 0), penetration };
}

export function sphereVsPlane(sphere, plane) {
  const distance = plane.distanceToPoint(sphere.center);
  if (Math.abs(distance) > sphere.radius) return null;
  return {
    normal: distance >= 0 ? plane.normal : scale3(plane.normal, -1),
    penetration: sphere.radius - Math.abs(distance),
  };
}

export function buildBasis(forward, worldUp = vec3(0, 1, 0)) {
  const f = normalize3(forward);
  let right = cross3(f, worldUp);
  if (lengthSq3(right) <= 1e-12) right = cross3(f, Math.abs(f.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0));
  right = normalize3(right);
  return { forward: f, right, up: normalize3(cross3(right, f)) };
}

export function buildTangentFrame(normal, tangentHint = vec3(1, 0, 0)) {
  const n = normalize3(normal);
  let tangent = sub3(tangentHint, scale3(n, dot3(tangentHint, n)));
  if (lengthSq3(tangent) <= 1e-12) tangent = buildBasis(n).right;
  tangent = normalize3(tangent);
  return { normal: n, tangent, bitangent: normalize3(cross3(n, tangent)) };
}

export function pickObject(ray, objects) {
  let closest = null;
  for (const object of objects) {
    const sphere = object.sphere ?? object.collider?.sphere ?? object.collider;
    if (!sphere?.center || !Number.isFinite(sphere.radius)) continue;
    const hit = raySphere(ray, sphere);
    if (hit && (!closest || hit.t < closest.t)) closest = { ...hit, object };
  }
  return closest;
}
