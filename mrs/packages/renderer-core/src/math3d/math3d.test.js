import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BVH3D,
  EngineClock,
  FIXED_DT,
  Perlin3,
  Plane3D,
  PhysicsWorld3D,
  Ray3D,
  aabbOverlap,
  applyMat4ToVector,
  cross3,
  dot3,
  intersectRayPlane,
  length3,
  normalize3,
  quatFromAxisAngle,
  quatToMat4,
  raySphere,
  vec3,
} from "./index.js";

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

describe("vec3", () => {
  it("computes dot and right-handed cross products", () => {
    assert.equal(dot3(vec3(1, 2, 3), vec3(4, 5, 6)), 32);
    assert.deepEqual(cross3(vec3(1, 0, 0), vec3(0, 1, 0)), vec3(0, 0, 1));
  });

  it("normalizes nonzero vectors and keeps zero stable", () => {
    closeTo(length3(normalize3(vec3(3, 4, 0))), 1);
    assert.deepEqual(normalize3(vec3()), vec3());
  });
});

describe("quaternion", () => {
  it("rotates a vector approximately 90 degrees around Y", () => {
    const rotation = quatToMat4(quatFromAxisAngle(vec3(0, 1, 0), Math.PI / 2));
    const result = applyMat4ToVector(rotation, vec3(1, 0, 0));
    closeTo(result.x, 0, 1e-8);
    closeTo(result.y, 0, 1e-8);
    closeTo(result.z, -1, 1e-8);
  });
});

describe("geometry and collision", () => {
  it("intersects a ray with a plane", () => {
    const ray = new Ray3D(vec3(0, 2, 0), vec3(0, -1, 0));
    const hit = intersectRayPlane(ray, Plane3D.fromPointNormal(vec3(), vec3(0, 1, 0)));
    assert.ok(hit);
    closeTo(hit.t, 2);
    assert.deepEqual(hit.point, vec3());
  });

  it("detects AABB overlap and ray-sphere hits", () => {
    const a = { min: vec3(-1, -1, -1), max: vec3(1, 1, 1) };
    const b = { min: vec3(0.5, 0.5, 0.5), max: vec3(2, 2, 2) };
    const c = { min: vec3(3, 3, 3), max: vec3(4, 4, 4) };
    assert.equal(aabbOverlap(a, b), true);
    assert.equal(aabbOverlap(a, c), false);
    const hit = raySphere(
      new Ray3D(vec3(0, 0, 5), vec3(0, 0, -1)),
      { center: vec3(), radius: 1 },
    );
    assert.ok(hit);
    closeTo(hit.t, 4);
  });
});

describe("fixed-step clock", () => {
  it("advances the expected deterministic number of steps", () => {
    const clock = new EngineClock();
    let calls = 0;
    const result = clock.advance(FIXED_DT * 3.5, (dt) => {
      closeTo(dt, FIXED_DT);
      calls++;
    });
    assert.equal(result.steps, 3);
    assert.equal(calls, 3);
    closeTo(result.alpha, 0.5);
  });

  it("keeps the 4D facade clamped to w=0", () => {
    const world = new PhysicsWorld3D({ gravity: vec3(0, -9.8, 0), damping: 1 });
    const body = world.createBody({ position: vec3(0, 1, 0), mass: 1 });
    body.applyForce(1, 0, 0);
    world.step(FIXED_DT);
    assert.equal(body.position.w, 0);
    assert.equal(body.velocity.w, 0);
    assert.equal(world.gravity.w, 0);
  });
});

describe("Perlin3", () => {
  it("is deterministic for identical seeds and coordinates", () => {
    const first = new Perlin3(12345);
    const second = new Perlin3(12345);
    closeTo(first.noise(1.25, -2.5, 8.75), second.noise(1.25, -2.5, 8.75));
    assert.notEqual(first.noise(1.25, -2.5, 8.75), new Perlin3(54321).noise(1.25, -2.5, 8.75));
  });
});

describe("BVH3D skeleton", () => {
  const primitive = (x) => ({
    bounds: { min: vec3(x - 0.25, -0.25, -0.25), max: vec3(x + 0.25, 0.25, 0.25) },
  });

  it("builds one leaf for at most four primitives", () => {
    const bvh = new BVH3D([primitive(0), primitive(1), primitive(2), primitive(3)]);
    assert.equal(bvh.root.leaf, true);
    assert.equal(bvh.root.primitives.length, 4);
  });

  it("builds children for larger primitive sets", () => {
    const bvh = new BVH3D(Array.from({ length: 8 }, (_, index) => primitive(index)));
    assert.equal(bvh.root.leaf, false);
    assert.ok(bvh.root.left);
    assert.ok(bvh.root.right);
  });
});
