#!/usr/bin/env node
/**
 * Smoke: pack BVH4D + GPU-shaped CPU traverse against Hypersphere.
 */
import { Hypersphere } from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import { BVH4D } from "../mrs/packages/renderer-core/src/render/rt4d/accel/BVH4D.js";
import { packBVH4D, intersectAABB4D, traverseBVH4DPacked } from "../mrs/packages/renderer-core/src/render/rt4d/accel/gpu/index.js";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";

const sphere = new Hypersphere(vec4(0, 0, 0, 0), 1);
sphere.materialId = "s";
const bvh = new BVH4D([sphere]);
const packed = packBVH4D(bvh);

const ray = {
  origin: vec4(0, 0, -3, 0),
  direction: vec4(0, 0, 1, 0),
  tMin: 0.001,
  tMax: 1e9,
};

const boxHit = intersectAABB4D(
  ray.origin,
  ray.direction,
  packed[0].minBounds,
  packed[0].maxBounds,
);
if (!boxHit.hit) {
  console.error("FAIL: root AABB miss");
  process.exit(1);
}

const hit = traverseBVH4DPacked(packed, ray, (primId, r) => {
  const h = sphere.intersect(r);
  return h ? { t: h.t, materialId: h.materialId } : null;
});

if (!hit || Math.abs(hit.t - 2) > 1e-3) {
  console.error("FAIL: expected sphere hit t≈2, got", hit);
  process.exit(1);
}

console.log("ok: bvh4d-gpu packed traverse t=", hit.t);
