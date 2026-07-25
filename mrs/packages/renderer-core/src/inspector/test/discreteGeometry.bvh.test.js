/**
 * Inspector discrete curvature + BVH picking tests.
 *
 * Sphere expectation (radius r): continuous principal curvatures k1 = k2 = 1/r.
 * Discrete uniform Laplace + angle-defect density approximates this on a refined
 * icosphere; tolerance is intentionally loose (relative 0.45) — not GPU/analytic.
 *
 * Run: node src/inspector/test/discreteGeometry.bvh.test.js
 */
import assert from "assert";
import {
  buildEdgeAdjacency,
  gaussianCurvature,
  meanCurvatureScalar,
  principalFromKH,
  computeMeshCurvature,
} from "../discreteGeometry.js";
import {
  principalCurvatureStub,
  principalCurvatureReal,
} from "../differential.js";
import { MeshPicker4D, BVH_FACE_THRESHOLD } from "../../picking/MeshPicker4D.js";
import { Ray4D } from "../../picking/Ray4D.js";
import { MRSInspector4D } from "../index.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

function normalize3(x, y, z) {
  const L = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / L, y: y / L, z: z / L, w: 0 };
}

/** Icosahedron → recursive midpoint subdivision on unit sphere, then scale by r. */
function createIcosphere(subdivisions = 2, radius = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    normalize3(-1, t, 0),
    normalize3(1, t, 0),
    normalize3(-1, -t, 0),
    normalize3(1, -t, 0),
    normalize3(0, -1, t),
    normalize3(0, 1, t),
    normalize3(0, -1, -t),
    normalize3(0, 1, -t),
    normalize3(t, 0, -1),
    normalize3(t, 0, 1),
    normalize3(-t, 0, -1),
    normalize3(-t, 0, 1),
  ];
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const midCache = new Map();
  function midpoint(i, j) {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (midCache.has(key)) return midCache.get(key);
    const a = verts[i];
    const b = verts[j];
    const m = normalize3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const idx = verts.length;
    verts.push(m);
    midCache.set(key, idx);
    return idx;
  }

  for (let s = 0; s < subdivisions; s++) {
    midCache.clear();
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  verts = verts.map((v) => ({
    x: v.x * radius,
    y: v.y * radius,
    z: v.z * radius,
    w: 0,
  }));
  return { vertices: verts, faces };
}

/** Flat XY grid of quads → two tris each; face count = 2 * nx * ny. */
function createGridMesh(nx, ny, size = 4) {
  const vertices = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      vertices.push({
        x: (i / nx - 0.5) * size,
        y: (j / ny - 0.5) * size,
        z: 0,
        w: 0,
      });
    }
  }
  const faces = [];
  const row = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      faces.push([a, b, d], [a, d, c]);
    }
  }
  return { vertices, faces };
}

console.log("\n--- Discrete geometry APIs ---");

test("buildEdgeAdjacency exposes edges and vertex neighbors", () => {
  const mesh = createIcosphere(1, 1);
  const adj = buildEdgeAdjacency(mesh);
  assert(adj.edges.length > 0, "edges");
  assert(adj.vertexFaces.length === mesh.vertices.length, "vf len");
  assert(adj.vertexVertices[0].length >= 3, "degree");
});

test("principalFromKH recovers k1,k2 from H,K", () => {
  const { k1, k2 } = principalFromKH(2, 3); // roots of λ²−6λ+2? wait H=3,K=2 → 3±√7
  assert(Math.abs(k1 + k2 - 6) < 1e-9, "sum 2H");
  assert(Math.abs(k1 * k2 - 2) < 1e-9, "product K");
});

test("principalCurvatureStub stays labeled stub", () => {
  const s = principalCurvatureStub({ x: 1, y: 0, z: 0, w: 0 }, { x: 0, y: 1, z: 0, w: 0 });
  assert.strictEqual(s.curvatureStub, true);
  assert.strictEqual(s.k1, 0);
  assert.strictEqual(s.k2, 0);
});

test("principalCurvatureReal sets curvatureStub false", () => {
  const r = principalCurvatureReal(
    { x: 1, y: 0, z: 0, w: 0 },
    { x: 0, y: 1, z: 0, w: 0 },
    { k1: 0.5, k2: 0.5, K: 0.25, H: 0.5 },
  );
  assert.strictEqual(r.curvatureStub, false);
  assert.strictEqual(r.k1, 0.5);
});

console.log("\n--- Sphere curvature (r=1, subdiv=3) ---");

test("icosphere principal ≈ 1/r within relative 0.45 (interior verts)", () => {
  const r = 1;
  const mesh = createIcosphere(3, r);
  const field = computeMeshCurvature(mesh);
  const expected = 1 / r;
  // Skip obvious boundary-ish low-degree outliers; icosphere is closed so all interior.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < mesh.vertices.length; i++) {
    const kAvg = 0.5 * (Math.abs(field.k1[i]) + Math.abs(field.k2[i]));
    if (!Number.isFinite(kAvg) || kAvg < 1e-6) continue;
    sum += kAvg;
    count++;
  }
  assert(count > 10, `sampled ${count}`);
  const meanK = sum / count;
  const rel = Math.abs(meanK - expected) / expected;
  console.log(`    mean |k|≈${meanK.toFixed(4)} expected ${expected} relErr=${rel.toFixed(3)} faces=${mesh.faces.length}`);
  assert(rel < 0.45, `relative error ${rel} ≥ 0.45`);
});

test("gaussian angle defect sums near 4π on closed mesh (Gauss–Bonnet χ=2)", () => {
  const mesh = createIcosphere(2, 1);
  const adj = buildEdgeAdjacency(mesh);
  let sum = 0;
  for (let i = 0; i < mesh.vertices.length; i++) {
    sum += gaussianCurvature(mesh, i, adj);
  }
  const target = 4 * Math.PI;
  assert(Math.abs(sum - target) < 0.05, `ΣK_defect=${sum} vs 4π=${target}`);
});

test("meanCurvatureScalar positive on sphere", () => {
  const mesh = createIcosphere(2, 1);
  const h = meanCurvatureScalar(mesh, 0);
  assert(h > 0, `H=${h}`);
});

console.log("\n--- BVH picking ---");

test(`MeshPicker4D builds BVH for ≥${BVH_FACE_THRESHOLD} faces`, () => {
  const mesh = createGridMesh(8, 8); // 128 faces
  assert(mesh.faces.length >= BVH_FACE_THRESHOLD);
  const picker = new MeshPicker4D(mesh);
  assert.strictEqual(picker.hasBVH(), true);
});

test("MeshPicker4D stays brute-force below threshold", () => {
  const mesh = createGridMesh(3, 3); // 18 faces
  assert(mesh.faces.length < BVH_FACE_THRESHOLD);
  const picker = new MeshPicker4D(mesh);
  assert.strictEqual(picker.hasBVH(), false);
});

test("BVH pick visits ≪ face count and usedBVH=true", () => {
  const mesh = createGridMesh(16, 16); // 512 faces
  const faceCount = mesh.faces.length;
  const picker = new MeshPicker4D(mesh);
  assert(picker.hasBVH(), "has BVH");
  const ray = new Ray4D({ x: 0, y: 0, z: 2, w: 0 }, { x: 0, y: 0, z: -1, w: 0 });
  const hit = picker.pick(ray);
  assert(hit, "expected hit");
  const stats = hit.pickStats ?? picker.lastPickStats;
  assert(stats.usedBVH === true, "usedBVH");
  assert(stats.faceCount === faceCount, "faceCount");
  console.log(`    nodeVisits=${stats.nodeVisits} faceCount=${faceCount}`);
  assert(stats.nodeVisits > 0, `nodeVisits must be counted (got ${stats.nodeVisits})`);
  assert(stats.nodeVisits < faceCount * 0.35, `visits ${stats.nodeVisits} not ≪ ${faceCount}`);
  assert(stats.nodeVisits < faceCount, "visits < faces");
});

test("inspector prefers real curvature (stub false) on sphere primitive", () => {
  const mesh = createIcosphere(2, 1);
  const insp = new MRSInspector4D({ mesh });
  const result = insp.inspectPrimitive(0, { x: 0.3, y: 0.3, z: 0, w: 0 });
  assert(result.ok, "ok");
  assert.strictEqual(result.curvature.curvatureStub, false);
  assert(Number.isFinite(result.curvature.k1), "k1");
  assert(Number.isFinite(result.curvature.k2), "k2");
});

test("inspector hasBVH on large mesh and spatial pick records visits", () => {
  const mesh = createGridMesh(12, 12); // 288 faces
  const insp = new MRSInspector4D({ mesh });
  assert(insp.hasBVH(), "hasBVH");
  const hit = insp._pickMeshSpatial(
    new Ray4D({ x: 0, y: 0, z: 3, w: 0 }, { x: 0, y: 0, z: -1, w: 0 }),
  );
  assert(hit, "spatial hit");
  assert(insp.lastPickStats?.usedBVH === true, "spatial BVH");
  console.log(
    `    spatial nodeVisits=${insp.lastPickStats.nodeVisits} faces=${mesh.faces.length}`,
  );
  assert(
    insp.lastPickStats.nodeVisits > 0,
    `spatial nodeVisits must be counted (got ${insp.lastPickStats.nodeVisits})`,
  );
  assert(insp.lastPickStats.nodeVisits < mesh.faces.length * 0.35);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
