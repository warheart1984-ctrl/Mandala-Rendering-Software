import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TriangleMesh4D,
  triangleMesh,
} from "../../src/render/rt4d/geometry/TriangleMesh4D.js";
import { Scene4D } from "../../src/render/rt4d/scene/Scene4D.js";
import { PathTracer4D } from "../../src/render/rt4d/integrator/PathTracer4D.js";
import { Camera4D } from "../../src/render/rt4d/camera/Camera4D.js";
import { Hypersphere } from "../../src/render/rt4d/geometry/hypersurface.js";
import { vec4, dot, normalize, sub } from "../../src/render/rt4d/math/vec4.js";

// ---------------------------------------------------------------------------
// Test fixtures: a single triangle and a two-triangle quad
// ---------------------------------------------------------------------------

/** Single equilateral-ish triangle in the XY plane at z=0. */
const SINGLE_TRI = {
  vertices: [0, 0, 0, 1, 0, 0, 0.5, 0.866, 0],
  indices: [0, 1, 2],
};

/** Two triangles forming a small quad in the XY plane at z=0. */
const QUAD = {
  vertices: [
    -1, -1, 0,  1, -1, 0,  1, 1, 0,  -1, 1, 0,
  ],
  indices: [0, 1, 2, 0, 2, 3],
};

/** Triangle with normals pointing up (+Y). */
const TRI_WITH_NORMALS = {
  vertices: [-1, 0, 0,  1, 0, 0,  0, 2, 0],
  indices: [0, 1, 2],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
};

/** Triangle with UVs for texture testing. */
const TRI_WITH_UVS = {
  vertices: [-1, 0, 0,  1, 0, 0,  0, 2, 0],
  indices: [0, 1, 2],
  uvs: [0, 0, 1, 0, 0.5, 1],
};

// ---------------------------------------------------------------------------
// Unit tests: TriangleMesh4D primitive
// ---------------------------------------------------------------------------

test("TriangleMesh4D computes correct AABB for a single triangle", () => {
  const mesh = new TriangleMesh4D(SINGLE_TRI);
  const bounds = mesh.getBounds();
  assert.ok(bounds);
  // Vertices: (0,0,0), (1,0,0), (0.5,0.866,0)
  assert.ok(bounds.min.x <= 0);
  assert.ok(bounds.max.x >= 1);
  assert.ok(bounds.min.y <= 0);
  assert.ok(bounds.max.y >= 0.866);
  assert.equal(bounds.min.w, 0);
  assert.equal(bounds.max.w, 0);
});

test("TriangleMesh4D computes correct centroid", () => {
  const mesh = new TriangleMesh4D(SINGLE_TRI);
  const center = mesh.getCenter();
  assert.ok(Array.isArray(center));
  assert.equal(center.length, 4);
  // Centroid of (0,0,0), (1,0,0), (0.5,0.866,0) = (0.5, 0.2887, 0, 0)
  assert.ok(Math.abs(center[0] - 0.5) < 0.01);
  assert.ok(Math.abs(center[1] - 0.2887) < 0.01);
  assert.equal(center[2], 0);
  assert.equal(center[3], 0);
});

test("TriangleMesh4D computes correct AABB for a quad", () => {
  const mesh = new TriangleMesh4D(QUAD);
  const bounds = mesh.getBounds();
  assert.ok(bounds.min.x <= -1);
  assert.ok(bounds.max.x >= 1);
  assert.ok(bounds.min.y <= -1);
  assert.ok(bounds.max.y >= 1);
});

test("TriangleMesh4D has an intersect method", () => {
  const mesh = new TriangleMesh4D(SINGLE_TRI);
  assert.equal(typeof mesh.intersect, "function");
});

test("TriangleMesh4D ray-triangle intersection hits the triangle", () => {
  const mesh = new TriangleMesh4D(SINGLE_TRI);
  // Ray from above pointing down at the triangle center (0.5, 0.289, 0).
  const ray = {
    origin: vec4(0.5, 0.289, 5, 0),
    direction: vec4(0, 0, -1, 0),
    tMin: 0,
    tMax: 100,
  };
  const hit = mesh.intersect(ray);
  assert.ok(hit, "ray should hit the triangle");
  assert.ok(hit.t > 0);
  assert.ok(hit.t < 10);
  assert.ok(hit.normal, "hit should have a normal");
  assert.ok(Math.abs(hit.position.z) < 0.1, "hit should be near z=0");
});

test("TriangleMesh4D ray misses when aimed to the side", () => {
  const mesh = new TriangleMesh4D(SINGLE_TRI);
  // Ray far to the right, should miss the triangle.
  const ray = {
    origin: vec4(10, 10, 5, 0),
    direction: vec4(0, 0, -1, 0),
    tMin: 0,
    tMax: 100,
  };
  const hit = mesh.intersect(ray);
  assert.equal(hit, null, "ray should miss");
});

test("TriangleMesh4D with normals returns interpolated normal", () => {
  const mesh = new TriangleMesh4D(TRI_WITH_NORMALS);
  // Ray at center of triangle.
  const ray = {
    origin: vec4(0, 0.666, 5, 0),
    direction: vec4(0, 0, -1, 0),
    tMin: 0,
    tMax: 100,
  };
  const hit = mesh.intersect(ray);
  assert.ok(hit, "should hit");
  assert.ok(hit.normal, "should have normal");
  // Normal should be roughly (0, 1, 0, 0) since all vertex normals point up.
  assert.ok(hit.normal.y > 0.5, `normal.y=${hit.normal.y} should be > 0.5`);
});

test("TriangleMesh4D with UVs returns interpolated UVs", () => {
  const mesh = new TriangleMesh4D(TRI_WITH_UVS);
  const ray = {
    origin: vec4(0, 0.666, 5, 0),
    direction: vec4(0, 0, -1, 0),
    tMin: 0,
    tMax: 100,
  };
  const hit = mesh.intersect(ray);
  assert.ok(hit, "should hit");
  assert.ok(hit.uv, "should have UV coordinates");
  assert.ok(Array.isArray(hit.uv));
  assert.equal(hit.uv.length, 2);
});

test("factory function triangleMesh creates a TriangleMesh4D", () => {
  const mesh = triangleMesh(SINGLE_TRI);
  assert.ok(mesh instanceof TriangleMesh4D);
  assert.ok(mesh.getBounds());
  assert.ok(mesh.getCenter());
});

test("TriangleMesh4D works with different vertex formats", () => {
  // Nested array format: [[x,y,z], [x,y,z], ...]
  const nested = {
    vertices: [[0, 0, 0], [1, 0, 0], [0.5, 0.866, 0]],
    indices: [0, 1, 2],
  };
  const mesh = new TriangleMesh4D(nested);
  const bounds = mesh.getBounds();
  assert.ok(bounds.min.x <= 0);
  assert.ok(bounds.max.x >= 1);
});

test("TriangleMesh4D empty mesh has zero bounds", () => {
  const mesh = new TriangleMesh4D({ vertices: [], indices: [] });
  const bounds = mesh.getBounds();
  assert.equal(bounds.min.x, 0);
  assert.equal(bounds.max.x, 0);
});

// ---------------------------------------------------------------------------
// Integration tests: TriangleMesh4D in a scene with PathTracer4D
// ---------------------------------------------------------------------------

test("triangle mesh renders in a scene with path tracer (no crash)", () => {
  const scene = new Scene4D();
  const mesh = triangleMesh({
    ...QUAD,
    materialId: "surf",
  });
  scene.addPrimitive(mesh, "surf");
  scene.materials.createMaterial("surf", "lambertian", {
    albedo: vec4(0.8, 0.2, 0.2, 1),
  });
  // Add a light (must be a Hypersphere for BVH intersection).
  scene.addLight(new Hypersphere(vec4(0, 3, 0, 0), 0.5), "light");
  scene.materials.createMaterial("light", "light", {
    emission: vec4(50, 50, 50, 0),
  });
  scene.build();

  // Camera looking down at the quad.
  const camera = new Camera4D({
    x: 0, y: 0, z: 5, w: 0,
    lx: 0, ly: 0, lz: 0, lw: 0,
    fovX: 60, fovY: 60, fovZ: 8, fovW: 8,
    width: 32, height: 32,
  });

  const rng = (() => {
    let s = 42;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  })();

  const tracer = new PathTracer4D({ maxDepth: 3, samplesPerPixel: 4, rng });

  // Render a single pixel at center.
  const ray = camera.generateRay(16, 16, 0.5, 0.5, 0.5, 0.5);
  const color = tracer.trace(ray, scene);
  assert.ok(typeof color.x === "number", "should return a vec4 color");
  assert.ok(Number.isFinite(color.x), "color.x should be finite");
});

test("triangle mesh gets placed in the top-level BVH (not brute-force)", () => {
  const scene = new Scene4D();
  const mesh = triangleMesh({
    ...QUAD,
    materialId: "surf",
  });
  scene.addPrimitive(mesh, "surf");
  scene.materials.createMaterial("surf", "lambertian", {
    albedo: vec4(0.8, 0.8, 0.8, 1),
  });
  // Add a hypersphere too (both in BVH).
  scene.addPrimitive(new Hypersphere(vec4(3, 0, 0, 0), 0.5), "surf");
  scene.build();
  assert.ok(scene.bvh, "scene should have a BVH (both primitives have getBounds)");
});

test("addTriangleMesh accepts raw options and wraps in TriangleMesh4D", () => {
  const scene = new Scene4D();
  scene.addTriangleMesh({ ...QUAD, materialId: "surf" }, "surf");
  scene.materials.createMaterial("surf", "lambertian", {
    albedo: vec4(0.8, 0.8, 0.8, 1),
  });
  scene.build();
  assert.ok(scene.bvh, "should have BVH after addTriangleMesh");
});

test("triangle mesh + hypersphere + lights render deterministically", () => {
  function render(seed) {
    const scene = new Scene4D();
    const mesh = triangleMesh({
      ...QUAD,
      materialId: "surf",
    });
    scene.addPrimitive(mesh, "surf");
    scene.materials.createMaterial("surf", "lambertian", {
      albedo: vec4(0.6, 0.6, 0.9, 1),
    });
    scene.addPrimitive(new Hypersphere(vec4(0, 0, 0, 0), 0.3), "surf");
    scene.addLight(new Hypersphere(vec4(2, 3, 1, 0), 0.4), "light");
    scene.materials.createMaterial("light", "light", {
      emission: vec4(80, 75, 70, 0),
    });
    scene.build();

    const camera = new Camera4D({
      x: 0, y: 1, z: 5, w: 0,
      lx: 0, ly: 0, lz: 0, lw: 0,
      fovX: 55, fovY: 55, fovZ: 8, fovW: 8,
      width: 24, height: 24,
    });

    const rng = (() => {
      let s = seed;
      return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    })();

    const tracer = new PathTracer4D({ maxDepth: 3, samplesPerPixel: 4, rng });
    const ray = camera.generateRay(12, 12, 0.5, 0.5, 0.5, 0.5);
    return tracer.trace(ray, scene);
  }

  const a = render(42);
  const b = render(42);
  assert.ok(Math.abs(a.x - b.x) < 1e-9, "deterministic x");
  assert.ok(Math.abs(a.y - b.y) < 1e-9, "deterministic y");
  assert.ok(Math.abs(a.z - b.z) < 1e-9, "deterministic z");
});
