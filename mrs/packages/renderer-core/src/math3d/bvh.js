import { aabbFromPoints, rayAABB } from "./geometry.js";
import { vec3 } from "./vec3.js";

const primitiveBounds = (primitive) => primitive.bounds ?? primitive.getBounds?.();
const centerOf = (bounds) => vec3(
  (bounds.min.x + bounds.max.x) * 0.5,
  (bounds.min.y + bounds.max.y) * 0.5,
  (bounds.min.z + bounds.max.z) * 0.5,
);

function unionBounds(primitives) {
  const points = [];
  for (const primitive of primitives) {
    const bounds = primitiveBounds(primitive);
    if (!bounds) throw new TypeError("BVH3D primitives require bounds or getBounds()");
    points.push(bounds.min, bounds.max);
  }
  return aabbFromPoints(points);
}

function largestAxis(bounds) {
  const extents = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  if (extents.x >= extents.y && extents.x >= extents.z) return "x";
  return extents.y >= extents.z ? "y" : "z";
}

/**
 * Skeleton median-split BVH. This establishes deterministic CPU traversal,
 * without claiming SAH optimization or packed/GPU parity.
 */
export class BVH3D {
  constructor(primitives = [], options = {}) {
    this.leafSize = options.leafSize ?? 4;
    if (!Number.isInteger(this.leafSize) || this.leafSize < 1) {
      throw new RangeError("BVH3D leafSize must be a positive integer");
    }
    this.primitives = [...primitives];
    this.root = this.primitives.length > 0 ? this._build([...this.primitives]) : null;
  }

  _build(primitives) {
    const bounds = unionBounds(primitives);
    if (primitives.length <= this.leafSize) {
      return { bounds, primitives, left: null, right: null, leaf: true };
    }
    const axis = largestAxis(bounds);
    primitives.sort((a, b) => centerOf(primitiveBounds(a))[axis] - centerOf(primitiveBounds(b))[axis]);
    const midpoint = Math.floor(primitives.length / 2);
    return {
      bounds,
      primitives: null,
      left: this._build(primitives.slice(0, midpoint)),
      right: this._build(primitives.slice(midpoint)),
      leaf: false,
    };
  }

  queryRay(ray, intersectPrimitive = (primitive) => primitive.intersect?.(ray) ?? null) {
    if (!this.root) return null;
    let closest = null;
    const stack = [this.root];
    while (stack.length > 0) {
      const node = stack.pop();
      const boundsHit = rayAABB(ray, node.bounds);
      if (!boundsHit || (closest && boundsHit.t > closest.t)) continue;
      if (node.leaf) {
        for (const primitive of node.primitives) {
          const hit = intersectPrimitive(primitive, ray);
          if (hit && hit.t >= ray.tMin && hit.t <= ray.tMax && (!closest || hit.t < closest.t)) {
            closest = { ...hit, primitive };
          }
        }
      } else {
        stack.push(node.right, node.left);
      }
    }
    return closest;
  }
}

export const buildBVH3D = (primitives, options) => new BVH3D(primitives, options);
export const queryBVH3DRay = (bvh, ray, intersectPrimitive) => bvh.queryRay(ray, intersectPrimitive);
