export class Collider4D {
  constructor(type = "hypersphere") {
    this.type = type;
  }
}

export class HyperplaneCollider extends Collider4D {
  constructor(normal, offset) {
    super("hyperplane");
    this.normal = normal;
    this.offset = offset;
  }

  distanceTo(point) {
    const nx = this.normal.x, ny = this.normal.y, nz = this.normal.z, nw = this.normal.w;
    const dot = point.x * nx + point.y * ny + point.z * nz + point.w * nw;
    return dot - this.offset;
  }

  getClosestPoint(point) {
    const nx = this.normal.x, ny = this.normal.y, nz = this.normal.z, nw = this.normal.w;
    const len2 = nx * nx + ny * ny + nz * nz + nw * nw;
    const dist = this.distanceTo(point);
    return {
      x: point.x - dist * nx / len2,
      y: point.y - dist * ny / len2,
      z: point.z - dist * nz / len2,
      w: point.w - dist * nw / len2,
    };
  }
}

export class HypersphereCollider extends Collider4D {
  constructor(radius = 1) {
    super("hypersphere");
    this.radius = radius;
  }

  distanceTo(point, center) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;
    const dw = point.w - center.w;
    return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw) - this.radius;
  }

  getClosestPoint(point, center) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;
    const dw = point.w - center.w;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
    if (dist === 0) return { ...center };
    const r = this.radius / dist;
    return { x: center.x + dx * r, y: center.y + dy * r, z: center.z + dz * r, w: center.w + dw * r };
  }
}

export class AABBCollider4D extends Collider4D {
  constructor(min, max) {
    super("aabb");
    this.min = { ...min };
    this.max = { ...max };
  }

  contains(point) {
    return point.x >= this.min.x && point.x <= this.max.x &&
           point.y >= this.min.y && point.y <= this.max.y &&
           point.z >= this.min.z && point.z <= this.max.z &&
           point.w >= this.min.w && point.w <= this.max.w;
  }

  getClosestPoint(point) {
    return {
      x: Math.max(this.min.x, Math.min(point.x, this.max.x)),
      y: Math.max(this.min.y, Math.min(point.y, this.max.y)),
      z: Math.max(this.min.z, Math.min(point.z, this.max.z)),
      w: Math.max(this.min.w, Math.min(point.w, this.max.w)),
    };
  }
}

export function detectCollision(bodyA, bodyB) {
  const ca = bodyA.collider;
  const cb = bodyB.collider;
  if (!ca || !cb) return null;

  if (ca.type === "hypersphere" && cb.type === "hyperplane") {
    return sphereVsPlane(bodyA, ca, bodyB, cb);
  }
  if (ca.type === "hyperplane" && cb.type === "hypersphere") {
    return sphereVsPlane(bodyB, cb, bodyA, ca);
  }
  if (ca.type === "hypersphere" && cb.type === "hypersphere") {
    return sphereVsSphere(bodyA, ca, bodyB, cb);
  }
  return null;
}

function sphereVsPlane(sphereBody, sphere, planeBody, plane) {
  const dist = plane.distanceTo(sphereBody.position);
  if (dist >= sphere.radius) return null;
  const normal = plane.normal;
  const nlen = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2 + normal.w ** 2);
  const penetration = sphere.radius - dist;
  return {
    normal: { x: -normal.x / nlen, y: -normal.y / nlen, z: -normal.z / nlen, w: -normal.w / nlen },
    penetration,
    contactPoint: sphereBody.position,
    bodyA: sphereBody,
    bodyB: planeBody,
  };
}

function sphereVsSphere(bodyA, ca, bodyB, cb) {
  const dx = bodyB.position.x - bodyA.position.x;
  const dy = bodyB.position.y - bodyA.position.y;
  const dz = bodyB.position.z - bodyA.position.z;
  const dw = bodyB.position.w - bodyA.position.w;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  const sumR = ca.radius + cb.radius;
  if (dist >= sumR) return null;
  const nx = dx / dist, ny = dy / dist, nz = dz / dist, nw = dw / dist;
  return {
    normal: { x: nx, y: ny, z: nz, w: nw },
    penetration: sumR - dist,
    contactPoint: {
      x: bodyA.position.x + nx * ca.radius,
      y: bodyA.position.y + ny * ca.radius,
      z: bodyA.position.z + nz * ca.radius,
      w: bodyA.position.w + nw * ca.radius,
    },
    bodyA,
    bodyB,
  };
}
