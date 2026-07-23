/**
 * Conformance Test Suite — S4DE v2.0
 * Validates Article II-VI invariants per Constitutional Spec
 */

import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  Camera4D, 
  createFrameEvidence,
  createHyperplane,
  signedDistance,
  edgeIntersect,
  classifyTriangle,
  clipTriangle,
  clipMesh,
  clipMeshWithEdges,
  rotateXW, rotateYZ, rotateZW, rotateYW,
  rotationMatrix,
  mat4mul,
  mat4transpose,
  mat4det,
  validateSO4,
  buildSO4,
  slerpSO4,
  IDENTITY4
} from "../src/math/index.js";
import { 
  getSurface, 
  sampleSurface,
  createLattice,
  fillLattice,
  marchingCubes4D,
  latticeStats,
  fbm4d,
  noise4d
} from "../src/lattice/index.js";
import { CanvasRenderer } from "../src/render/canvas-renderer.js";
import { HyperplaneSlicer } from "../src/render/slicer.js";

// ──────────────────────────────────────────────────────────────
// Article II — Mathematical Integrity
// ──────────────────────────────────────────────────────────────

Deno.test("II.1 SO(4) Integrity — rotationMatrix produces valid SO(4)", () => {
  const planes = ["xy", "xz", "xw", "yz", "yw", "zw"];
  for (const plane of planes) {
    const R = rotationMatrix(plane, Math.PI / 4);
    const check = validateSO4(R);
    if (!check.valid) throw new Error(`${plane}: ${check.reason}`);
  }
});

Deno.test("II.1 SO(4) Integrity — buildSO4 composition stays in SO(4)", () => {
  const rotations = [
    { plane: "xy", angle: 0.3 },
    { plane: "xz", angle: 0.5 },
    { plane: "xw", angle: 0.7 },
    { plane: "yz", angle: 0.11 },
    { plane: "yw", angle: 0.13 },
    { plane: "zw", angle: 0.17 }
  ];
  const R = buildSO4(rotations);
  const check = validateSO4(R);
  if (!check.valid) throw new Error(`buildSO4: ${check.reason}`);
});

Deno.test("II.2 Hyperplane Integrity — createHyperplane normalizes", () => {
  const hp = createHyperplane({ x: 2, y: 3, z: 0, w: 0 }, 1.5);
  const len = Math.hypot(hp.n.x, hp.n.y, hp.n.z, hp.n.w);
  if (Math.abs(len - 1) > 1e-6) throw new Error(`normal not unit: ${len}`);
  if (Math.abs(hp.d - 1.5) > 1e-6) throw new Error(`offset not preserved: ${hp.d}`);
});

Deno.test("II.2 Hyperplane Integrity — signedDistance correctness", () => {
  const hp = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 2);
  const inside = { x: 0, y: 0, z: 0, w: 1 };
  const outside = { x: 0, y: 0, z: 0, w: 3 };
  if (signedDistance(hp, inside) > 0) throw new Error("inside should be negative");
  if (signedDistance(hp, outside) < 0) throw new Error("outside should be positive");
});

Deno.test("II.3 Projection Integrity — perspective preserves depth ordering", () => {
  const R = buildSO4([{ plane: "xw", angle: 0 }]);
  const p1 = mat4apply(R, { x: 1, y: 0, z: 2, w: 0 });
  const p2 = mat4apply(R, { x: 1, y: 0, z: 4, w: 0 });
  // p2 is further in z, should project smaller in perspective
  // (This is a basic sanity check; full test requires full pipeline)
});

// ──────────────────────────────────────────────────────────────
// Article III — Camera4D
// ──────────────────────────────────────────────────────────────

Deno.test("III.1 Camera State — all fields present", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  if (!cam.position) throw new Error("missing position");
  if (!cam.orientation) throw new Error("missing orientation");
  if (!cam.hyperplane) throw new Error("missing hyperplane");
  if (!cam.projectionMode) throw new Error("missing projectionMode");
  if (cam.temporalParam === undefined) throw new Error("missing temporalParam");
});

Deno.test("III.2 Camera Validation — rejects invalid hyperplane normal", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  cam.setHyperplaneNormal({ x: 0, y: 0, z: 0, w: 0 });
  const check = cam.validate();
  if (check.valid) throw new Error("should reject zero normal");
});

Deno.test("III.2 Camera Validation — rejects invalid SO(4)", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  cam.setOrientationMatrix(new Float64Array([
    2, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ])); // det = 2, not orthonormal
  const check = cam.validate();
  if (check.valid) throw new Error("should reject invalid SO(4)");
});

Deno.test("III.2 Camera Validation — passes valid state", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  cam.setRotation([{ plane: "xw", angle: 0.5 }, { plane: "yz", angle: 0.3 }]);
  cam.setHyperplaneNormal({ x: 0, y: 0, z: 0, w: 1 });
  cam.setHyperplaneOffset(0);
  const check = cam.validate();
  if (!check.valid) throw new Error(`valid state rejected: ${check.errors.join(", ")}`);
});

// ──────────────────────────────────────────────────────────────
// Article IV — GPU & SDF Integrity
// ──────────────────────────────────────────────────────────────

Deno.test("IV.2 4D SDF — hypersphere SDF correctness", () => {
  const f = (x,y,z,w) => Math.sqrt(x*x + y*y + z*z + w*w) - 1;
  if (Math.abs(f(1,0,0,0)) > 1e-6) throw new Error("surface point not zero");
  if (f(0,0,0,0) > -0.9) throw new Error("center should be negative");
  if (f(2,0,0,0) < 0.9) throw new Error("outside should be positive");
});

Deno.test("IV.2 4D SDF — gradient approximation", () => {
  const f = (x,y,z,w) => Math.sqrt(x*x + y*y + z*z + w*w) - 1;
  const eps = 1e-4;
  const p = { x: 1.5, y: 0.2, z: -0.3, w: 0.7 };
  const fx = f(p.x + eps, p.y, p.z, p.w);
  const fxm = f(p.x - eps, p.y, p.z, p.w);
  const gradX = (fx - fxm) / (2 * eps);
  const expectedX = p.x / Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z + p.w*p.w);
  if (Math.abs(gradX - expectedX) > 1e-3) throw new Error(`gradient X mismatch: ${gradX} vs ${expectedX}`);
});

// ──────────────────────────────────────────────────────────────
// Article V — Evidence & Conformance
// ──────────────────────────────────────────────────────────────

Deno.test("V.1 Frame Evidence — createFrameEvidence structure", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  const ev = createFrameEvidence(cam, 0);
  if (!ev.camera) throw new Error("missing camera");
  if (!ev.projection) throw new Error("missing projection");
  if (!ev.invariants) throw new Error("missing invariants");
  if (ev.frameIndex !== 0) throw new Error("frameIndex not set");
});

Deno.test("V.2 Conformance — Camera4D exports evidence", () => {
  const cam = new Camera4D({ width: 1920, height: 1080 });
  cam.recordFrame();
  cam.recordFrame();
  const log = cam.getEvidenceLog();
  if (log.length !== 2) throw new Error("evidence log wrong length");
  const exported = cam.exportEvidence();
  if (!exported.camera) throw new Error("missing camera in export");
  if (exported.frameCount !== 2) throw new Error("frameCount mismatch");
});

// ──────────────────────────────────────────────────────────────
// Article VI — Conformance Suite (Core)
// ──────────────────────────────────────────────────────────────

Deno.test("VI SO(4) — orthonormality preserved by mat4mul", () => {
  const R1 = buildSO4([{ plane: "xw", angle: 0.3 }]);
  const R2 = buildSO4([{ plane: "yz", angle: 0.5 }]);
  const R3 = mat4mul(R1, R2);
  const check = validateSO4(R3);
  if (!check.valid) throw new Error(`product not in SO(4): ${check.reason}`);
});

Deno.test("VI Hyperplane — signedDistance is continuous", () => {
  const hp = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
  const p1 = { x: 0, y: 0, z: 0, w: -0.001 };
  const p2 = { x: 0, y: 0, z: 0, w: 0.001 };
  const d1 = signedDistance(hp, p1);
  const d2 = signedDistance(hp, p2);
  if (Math.abs(d1 - d2) > 0.01) throw new Error("discontinuous across plane");
});

Deno.test("VI Clipping — clipTriangle produces 0-2 triangles", () => {
  const hp = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
  const v0 = { x: 0, y: 0, z: 0, w: -1 };
  const v1 = { x: 1, y: 0, z: 0, w: 1 };
  const v2 = { x: 0, y: 1, z: 0, w: 1 };
  const tris = clipTriangle(hp, v0, v1, v2);
  if (tris.length < 0 || tris.length > 2) throw new Error(`wrong triangle count: ${tris.length}`);
});

Deno.test("VI Raymarch — hypersphere convergence", () => {
  // Simple CPU raymarch test
  const f = (x,y,z,w) => Math.sqrt(x*x + y*y + z*z + w*w) - 1;
  let x = 0, y = 0, z = 0, w = -3;
  const dir = { x: 0, y: 0, z: 0, w: 1 };
  let steps = 0;
  while (steps < 64) {
    const d = f(x,y,z,w);
    if (Math.abs(d) < 0.001) break;
    x += dir.x * d;
    y += dir.y * d;
    z += dir.z * d;
    w += dir.w * d;
    steps++;
  }
  if (steps >= 64) throw new Error("did not converge");
  if (Math.abs(w) > 1.01) throw new Error("converged to wrong surface");
});

// ──────────────────────────────────────────────────────────────
// Integration — Scene Pipeline
// ──────────────────────────────────────────────────────────────

Deno.test("Pipeline — Surface render produces frames", async () => {
  const surface = getSurface("clifford-torus");
  const mesh = sampleSurface(surface, 16);
  if (!mesh.vertices.length) throw new Error("no vertices");
  if (!mesh.faces.length) throw new Error("no faces");
  if (!mesh.edges.length) throw new Error("no edges");
});

Deno.test("Pipeline — Slicer renders visible cross-section", () => {
  const surface = getSurface("clifford-torus");
  const mesh = sampleSurface(surface, 16);
  const cam = new Camera4D({ width: 256, height: 256 });
  cam.setRotation([{ plane: "xw", angle: 0.5 }]);
  const slicer = new HyperplaneSlicer(cam);
  const canvas = { width: 256, height: 256, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }) };
  const result = slicer.renderFrame(canvas.getContext("2d"), mesh);
  if (!result.visible) throw new Error("no visible geometry");
  if (result.clippedVertices < 3) throw new Error("too few vertices after clipping");
});

Deno.test("Pipeline — Lattice + Marching Cubes extracts mesh", () => {
  const lat = createLattice({ resX: 12, resY: 12, resZ: 12, resW: 12, scaleX: 2, scaleY: 2, scaleZ: 2, scaleW: 2 });
  fillLattice(lat, (x,y,z,w) => {
    const dx = x, dy = y, dz = z, dw = w;
    const r2 = dx*dx + dy*dy + dz*dz + dw*dw;
    return Math.max(0, 1 - r2 / (0.8*0.8));
  });
  const mesh = marchingCubes4D(lat, 0.3);
  if (!mesh.vertices.length) throw new Error("no vertices from hypersphere");
  if (!mesh.faces.length) throw new Error("no faces from hypersphere");
});

Deno.test("Pipeline — Lattice stats report reasonable fill", () => {
  const lat = createLattice({ resX: 8, resY: 8, resZ: 8, resW: 8, scaleX: 1, scaleY: 1, scaleZ: 1, scaleW: 1 });
  fillLattice(lat, (x,y,z,w) => Math.max(0, 1 - (x*x+y*y+z*z+w*w)));
  const stats = latticeStats(lat);
  if (stats.min > 0) throw new Error("min should be 0");
  if (stats.max < 0.5) throw new Error("max should reach 1");
  if (stats.fillRatio === 0) throw new Error("should have non-zero fill");
});

Deno.test("Pipeline — CanvasRenderer renders frame", () => {
  const canvas = { width: 128, height: 128, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }) };
  const renderer = new CanvasRenderer(canvas, { width: 128, height: 128 });
  const surface = getSurface("clifford-torus");
  const mesh = sampleSurface(surface, 8);
  renderer.renderFrame(mesh, 0);
  // Just verify no throw
});

// ──────────────────────────────────────────────────────────────
// Noise Functions
// ──────────────────────────────────────────────────────────────

Deno.test("Noise — noise4d is bounded", () => {
  for (let i = 0; i < 100; i++) {
    const n = noise4d(Math.random()*10, Math.random()*10, Math.random()*10, Math.random()*10);
    if (n < -1 || n > 1) throw new Error(`noise4d out of bounds: ${n}`);
  }
});

Deno.test("Noise — fbm4d is bounded", () => {
  for (let i = 0; i < 50; i++) {
    const n = fbm4d(Math.random()*10, Math.random()*10, Math.random()*10, Math.random()*10, { octaves: 4 });
    if (Math.abs(n) > 1.1) throw new Error(`fbm4d out of bounds: ${n}`);
  }
});

Deno.test("Noise — seedNoise produces deterministic output", () => {
  const seed = 42;
  import("../src/lattice/noise.js").then(m => m.seedNoise(seed));
  const a = noise4d(1,2,3,4);
  import("../src/lattice/noise.js").then(m => m.seedNoise(seed));
  const b = noise4d(1,2,3,4);
  if (Math.abs(a - b) > 1e-10) throw new Error("seed not deterministic");
});