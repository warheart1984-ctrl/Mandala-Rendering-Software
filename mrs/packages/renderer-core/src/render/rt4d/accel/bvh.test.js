/**
 * BVH tests — HyperBox (AABB intersection, surface area),
 * BVH4D (SAH build, traversal), bvh4dPacked (pack, flatten, traverse).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vec4, add, sub, scale } from "../math/vec4.js";

// ─── HyperBox ────────────────────────────────────────────────────────

import { HyperBox } from "./HyperBox.js";

describe("HyperBox", () => {
  it("constructor initializes min to +inf and max to -inf", () => {
    const b = new HyperBox();
    assert.equal(b.min.x, Infinity);
    assert.equal(b.min.y, Infinity);
    assert.equal(b.max.x, -Infinity);
    assert.equal(b.max.y, -Infinity);
  });

  it("expand grows bounds to include point", () => {
    const b = new HyperBox();
    b.expand(vec4(1, 2, 3, 4));
    assert.equal(b.min.x, 1);
    assert.equal(b.min.y, 2);
    assert.equal(b.min.z, 3);
    assert.equal(b.min.w, 4);
    assert.equal(b.max.x, 1);
    assert.equal(b.max.y, 2);
    b.expand(vec4(-1, 5, 0, 2));
    assert.equal(b.min.x, -1);
    assert.equal(b.max.y, 5);
  });

  it("expandBox merges two boxes", () => {
    const a = new HyperBox();
    a.expand(vec4(0, 0, 0, 0));
    a.expand(vec4(2, 2, 2, 2));
    const b = new HyperBox();
    b.expand(vec4(1, 1, 1, 1));
    b.expand(vec4(3, 3, 3, 3));
    a.expandBox(b);
    assert.equal(a.min.x, 0);
    assert.equal(a.max.x, 3);
    assert.equal(a.min.w, 0);
    assert.equal(a.max.w, 3);
  });

  it("surfaceArea computes 4D hypervolume surface", () => {
    const b = new HyperBox();
    b.expand(vec4(0, 0, 0, 0));
    b.expand(vec4(1, 1, 1, 1));
    // SA = 2*(dx*dy*dz + dx*dy*dw + dx*dz*dw + dy*dz*dw)
    //    = 2*(1*1*1 + 1*1*1 + 1*1*1 + 1*1*1) = 2*4 = 8
    assert.equal(b.surfaceArea(), 8);
  });

  it("surfaceArea of zero-extent box is 0", () => {
    const b = new HyperBox();
    b.expand(vec4(1, 2, 3, 4));
    assert.equal(b.surfaceArea(), 0);
  });

  it("intersect returns true when ray hits the box", () => {
    const b = new HyperBox();
    b.expand(vec4(-1, -1, -1, -1));
    b.expand(vec4(1, 1, 1, 1));
    const ray = { origin: vec4(0, 0, 5, 0), direction: vec4(0, 0, -1, 0), tMin: 0.001 };
    assert.equal(b.intersect(ray), true);
  });

  it("intersect returns false when ray misses the box", () => {
    const b = new HyperBox();
    b.expand(vec4(-1, -1, -1, -1));
    b.expand(vec4(1, 1, 1, 1));
    const ray = { origin: vec4(10, 0, 0, 0), direction: vec4(0, 0, -1, 0), tMin: 0.001 };
    assert.equal(b.intersect(ray), false);
  });

  it("intersect returns false when box is behind ray", () => {
    const b = new HyperBox();
    b.expand(vec4(-1, -1, -1, -1));
    b.expand(vec4(1, 1, 1, 1));
    const ray = { origin: vec4(0, 0, -5, 0), direction: vec4(0, 0, -1, 0), tMin: 0.001 };
    assert.equal(b.intersect(ray), false);
  });

  it("intersect handles ray from inside the box", () => {
    const b = new HyperBox();
    b.expand(vec4(-1, -1, -1, -1));
    b.expand(vec4(1, 1, 1, 1));
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(0, 1, 0, 0), tMin: 0.001 };
    assert.equal(b.intersect(ray), true);
  });

  it("intersect handles w-axis aligned ray", () => {
    const b = new HyperBox();
    b.expand(vec4(-1, -1, -1, -1));
    b.expand(vec4(1, 1, 1, 1));
    const ray = { origin: vec4(0, 0, 0, 5), direction: vec4(0, 0, 0, -1), tMin: 0.001 };
    assert.equal(b.intersect(ray), true);
  });
});

// ─── BVH4D ───────────────────────────────────────────────────────────

import { BVH4D } from "./BVH4D.js";

function makeTestPrimitive(cx, cy, cz, cw, halfSize) {
  return {
    getBounds() {
      return {
        min: vec4(cx - halfSize, cy - halfSize, cz - halfSize, cw - halfSize),
        max: vec4(cx + halfSize, cy + halfSize, cz + halfSize, cw + halfSize),
      };
    },
    getCenter() {
      return vec4(cx, cy, cz, cw);
    },
    intersect(ray) {
      const o = ray.origin;
      const d = ray.direction;
      let tMin = -Infinity, tMax = Infinity;
      const mins = [cx - halfSize, cy - halfSize, cz - halfSize, cw - halfSize];
      const maxs = [cx + halfSize, cy + halfSize, cz + halfSize, cw + halfSize];
      const origins = [o.x, o.y, o.z, o.w];
      const dirs = [d.x, d.y, d.z, d.w];
      for (let i = 0; i < 4; i++) {
        const invD = 1 / (Math.abs(dirs[i]) > 1e-12 ? dirs[i] : 1e-12);
        let t0 = (mins[i] - origins[i]) * invD;
        let t1 = (maxs[i] - origins[i]) * invD;
        if (invD < 0) [t0, t1] = [t1, t0];
        tMin = Math.max(tMin, t0);
        tMax = Math.min(tMax, t1);
        if (tMax <= tMin) return null;
      }
      if (tMax <= 0) return null;
      return { t: tMin, point: vec4(o.x + d.x * tMin, o.y + d.y * tMin, o.z + d.z * tMin, o.w + d.w * tMin) };
    },
  };
}

function makeSphere(center, radius) {
  return {
    getBounds() {
      return {
        min: vec4(center.x - radius, center.y - radius, center.z - radius, center.w - radius),
        max: vec4(center.x + radius, center.y + radius, center.z + radius, center.w + radius),
      };
    },
    getCenter() {
      return vec4(center.x, center.y, center.z, center.w);
    },
    intersect(ray) {
      const o = ray.origin;
      const d = ray.direction;
      const oc = sub(o, center);
      const a = d.x * d.x + d.y * d.y + d.z * d.z + d.w * d.w;
      const b = 2 * (oc.x * d.x + oc.y * d.y + oc.z * d.z + oc.w * d.w);
      const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z + oc.w * oc.w - radius * radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) return null;
      return { t, point: vec4(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t, o.w + d.w * t) };
    },
  };
}

describe("BVH4D", () => {
  it("constructor builds empty BVH for no primitives", () => {
    const bvh = new BVH4D([]);
    assert.equal(bvh.nodes.length, 0);
  });

  it("constructor builds single leaf for small primitive set", () => {
    const prims = [makeTestPrimitive(0, 0, 0, 0, 0.5)];
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    assert.equal(bvh.nodes.length, 1);
    assert.equal(bvh.nodes[0].start, 0);
    assert.equal(bvh.nodes[0].end, 1);
  });

  it("builds multi-node BVH for many primitives", () => {
    const prims = [];
    for (let i = 0; i < 20; i++) {
      prims.push(makeTestPrimitive(i * 2, 0, 0, 0, 0.5));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    assert.ok(bvh.nodes.length > 1);
    // Every node should have a valid box
    for (const n of bvh.nodes) {
      assert.ok(n.box.min.x <= n.box.max.x);
    }
  });

  it("builds balanced tree for 3D grid of spheres", () => {
    const prims = [];
    for (let x = -4; x <= 4; x += 2) {
      for (let y = -4; y <= 4; y += 2) {
        for (let z = -4; z <= 4; z += 2) {
          prims.push(makeSphere(vec4(x, y, z, 0), 0.5));
        }
      }
    }
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    // Leaves should contain <= leafThreshold primitives
    let totalLeafPrims = 0;
    for (const n of bvh.nodes) {
      if (n.start >= 0) {
        const count = n.end - n.start;
        assert.ok(count <= 4);
        totalLeafPrims += count;
      }
    }
    assert.equal(totalLeafPrims, prims.length);
  });

  it("traverse finds closest intersection", () => {
    const targets = [
      makeTestPrimitive(0, 0, 5, 0, 0.5),
      makeTestPrimitive(0, 0, 3, 0, 0.5),
      makeTestPrimitive(0, 0, 10, 0, 0.5),
    ];
    const bvh = new BVH4D(targets, { leafThreshold: 4 });
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(0, 0, 1, 0), tMin: 0.001 };
    const hit = bvh.traverse(ray);
    assert.ok(hit !== null);
    assert.ok(hit.t > 0);
    // Should hit the closest primitive at t=3 (t=2.5 to z=3 sphere, radius 0.5)
    assert.ok(Math.abs(hit.t - 2.5) < 0.01);
  });

  it("traverse returns null for ray missing all primitives", () => {
    const prims = [makeTestPrimitive(5, 5, 5, 0, 0.5)];
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(1, 0, 0, 0), tMin: 0.001 };
    const hit = bvh.traverse(ray);
    assert.equal(hit, null);
  });

  it("splits along multiple axes for 4D scattered data", () => {
    const prims = [];
    for (let i = 0; i < 30; i++) {
      prims.push(makeTestPrimitive(
        Math.sin(i * 0.5) * 10,
        Math.cos(i * 0.7) * 10,
        Math.sin(i * 1.1) * 10,
        Math.cos(i * 0.3) * 10,
        0.5,
      ));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    assert.ok(bvh.nodes.length >= 5);
    for (const n of bvh.nodes) {
      assert.ok(Number.isFinite(n.box.min.x));
      assert.ok(Number.isFinite(n.box.max.x));
    }
  });

  it("traverse with layered 4D primitives returns correct closest hit", () => {
    const prims = [];
    for (let w = -2; w <= 2; w++) {
      prims.push(makeTestPrimitive(0, 0, 0, w * 4, 0.5));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 2 });
    const ray = { origin: vec4(0, 0, 0, 10), direction: vec4(0, 0, 0, -1), tMin: 0.001 };
    const hit = bvh.traverse(ray);
    assert.ok(hit !== null);
    assert.ok(hit.t > 0);
  });
});

// ─── bvh4dPacked ─────────────────────────────────────────────────────

import {
  packBVH4D,
  flattenBVH4DNodes,
  intersectAABB4D,
  traverseBVH4DPacked,
} from "./gpu/bvh4dPacked.js";

describe("bvh4dPacked", () => {
  it("packBVH4D converts BVH nodes to flat structure", () => {
    const bvh = new BVH4D([makeTestPrimitive(0, 0, 0, 0, 0.5)]);
    const packed = packBVH4D(bvh);
    assert.equal(packed.length, 1);
    assert.equal(packed[0].primCount, 1);
    assert.equal(packed[0].firstPrim, 0);
    assert.deepEqual(packed[0].minBounds, [-0.5, -0.5, -0.5, -0.5]);
  });

  it("flattenBVH4DNodes produces correct Float32Array layout", () => {
    const bvh = new BVH4D([makeTestPrimitive(1, 2, 3, 4, 0.5)]);
    const packed = packBVH4D(bvh);
    const flat = flattenBVH4DNodes(packed);
    assert.equal(flat.length, 12);
    assert.equal(flat[0], 0.5);  // minX
    assert.equal(flat[1], 1.5);  // minY
    assert.equal(flat[2], 2.5);  // minZ
    assert.equal(flat[3], 3.5);  // minW
    assert.equal(flat[4], 1.5);  // maxX
    assert.equal(flat[8], -1);   // leftChild
    assert.equal(flat[9], -1);   // rightChild
    assert.equal(flat[10], 0);   // firstPrim
    assert.equal(flat[11], 1);   // primCount
  });

  it("intersectAABB4D detects ray-box intersection", () => {
    const result = intersectAABB4D(
      vec4(0, 0, 5, 0), vec4(0, 0, -1, 0),
      [-1, -1, -1, -1], [1, 1, 1, 1],
    );
    assert.equal(result.hit, true);
  });

  it("intersectAABB4D returns miss for non-intersecting ray", () => {
    const result = intersectAABB4D(
      vec4(10, 0, 0, 0), vec4(0, 0, -1, 0),
      [-1, -1, -1, -1], [1, 1, 1, 1],
    );
    assert.equal(result.hit, false);
  });

  it("intersectAABB4D returns miss when box is behind ray", () => {
    const result = intersectAABB4D(
      vec4(0, 0, -5, 0), vec4(0, 0, -1, 0),
      [-1, -1, -1, -1], [1, 1, 1, 1],
    );
    assert.equal(result.hit, false);
  });

  it("intersectAABB4D returns hit for ray from inside box", () => {
    const result = intersectAABB4D(
      vec4(0, 0, 0, 0), vec4(0, 1, 0, 0),
      [-1, -1, -1, -1], [1, 1, 1, 1],
    );
    assert.equal(result.hit, true);
  });

  it("intersectAABB4D computes correct tEnter and tExit", () => {
    const result = intersectAABB4D(
      vec4(0, 0, -5, 0), vec4(0, 0, 1, 0),
      [-1, -1, -1, -1], [1, 1, 1, 1], 0, 1e30,
    );
    assert.equal(result.hit, true);
    assert.ok(result.tEnter > 3 && result.tEnter < 5);
  });

  it("traverseBVH4DPacked finds closest hit in single-leaf BVH", () => {
    const prims = [makeTestPrimitive(0, 0, 5, 0, 0.5)];
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    const packed = packBVH4D(bvh);
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(0, 0, 1, 0), tMin: 0.001 };
    const hit = traverseBVH4DPacked(packed, ray, (primId) => prims[primId].intersect(ray));
    assert.ok(hit !== null);
    assert.ok(hit.t > 0);
  });

  it("traverseBVH4DPacked returns null for ray missing all", () => {
    const prims = [makeTestPrimitive(5, 5, 5, 0, 0.5)];
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    const packed = packBVH4D(bvh);
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(1, 0, 0, 0), tMin: 0.001 };
    const hit = traverseBVH4DPacked(packed, ray, () => null);
    assert.equal(hit, null);
  });

  it("traverseBVH4DPacked finds correct closest among multiple primitives", () => {
    const prims = [
      makeTestPrimitive(0, 0, 5, 0, 0.5),   // t≈4.5
      makeTestPrimitive(0, 0, 3, 0, 0.5),   // t≈2.5
      makeTestPrimitive(0, 0, 10, 0, 0.5),  // t≈9.5
    ];
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    const packed = packBVH4D(bvh);
    const ray = { origin: vec4(0, 0, 0, 0), direction: vec4(0, 0, 1, 0), tMin: 0.001 };
    const hit = traverseBVH4DPacked(packed, ray, (primId) => prims[primId].intersect(ray));
    assert.ok(hit !== null);
    assert.ok(Math.abs(hit.t - 2.5) < 0.01);
    assert.equal(hit.primId, 1); // middle primitive is closest
  });

  it("traverseBVH4DPacked works with large multi-level BVH", () => {
    const prims = [];
    for (let i = 0; i < 40; i++) {
      prims.push(makeSphere(vec4(i * 3 - 60, 0, 0, 0), 0.5));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 4 });
    assert.ok(bvh.nodes.length >= 5);
    const packed = packBVH4D(bvh);
    const ray = { origin: vec4(-100, 0, 0, 0), direction: vec4(1, 0, 0, 0), tMin: 0.001 };
    const hit = traverseBVH4DPacked(packed, ray, (primId) => prims[primId].intersect(ray));
    assert.ok(hit !== null);
    assert.ok(hit.t > 0);
  });

  it("flattenBVH4DNodes produces consistent round-trip with pack", () => {
    const prims = [];
    for (let i = 0; i < 12; i++) {
      prims.push(makeTestPrimitive(i * 5, 0, 0, 0, 1));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 3 });
    const packed = packBVH4D(bvh);
    const flat = flattenBVH4DNodes(packed);
    // Each node is 12 floats, total floats = nodes * 12
    assert.equal(flat.length, packed.length * 12);
    for (let i = 0; i < packed.length; i++) {
      const o = i * 12;
      assert.equal(flat[o], packed[i].minBounds[0]);
      assert.equal(flat[o + 4], packed[i].maxBounds[0]);
      assert.equal(flat[o + 8], packed[i].leftChild);
      assert.equal(flat[o + 11], packed[i].primCount);
    }
  });

  it("packed traverse gives same result as BVH4D.traverse", () => {
    const prims = [];
    for (let i = 0; i < 15; i++) {
      prims.push(makeTestPrimitive(
        (i % 5) * 10 - 20,
        Math.floor(i / 5) * 10 - 10,
        0, 0, 0.5
      ));
    }
    const bvh = new BVH4D(prims, { leafThreshold: 3 });
    const packed = packBVH4D(bvh);
    const ray = { origin: vec4(0, 0, -5, 0), direction: vec4(0, 0, 1, 0), tMin: 0.001 };

    const bvhHit = bvh.traverse(ray);
    const packedHit = traverseBVH4DPacked(packed, ray, (primId) => prims[primId].intersect(ray));

    assert.equal(bvhHit !== null, packedHit !== null);
    if (bvhHit && packedHit) {
      assert.ok(Math.abs(bvhHit.t - packedHit.t) < 1e-10);
    }
  });
});
