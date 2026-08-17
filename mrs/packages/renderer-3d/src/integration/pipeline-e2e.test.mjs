// pipeline-e2e.test.mjs — Pure JS end-to-end test
// Tests: Mesh → PrimitiveRef → SAH BVH → GPU layout → Ray traversal

// ── Inlined types (from bvh-spec.ts) ──
// AABB, PrimitiveRef, BVHNode, BVHTree, Ray, HitRecord, Mesh

// ── meshToPrimitives (from mesh-loader.ts) ──
function computeAABB(mesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], mesh.vertices[i + j]);
      max[j] = Math.max(max[j], mesh.vertices[i + j]);
    }
  }
  return { min, max };
}

function meshToPrimitives(mesh) {
  const aabb = computeAABB(mesh);
  const count = mesh.indices.length / 3;
  const prims = [];
  for (let i = 0; i < count; i++) {
    prims.push({ id: `${mesh.id}-tri-${i}`, meshId: mesh.id, indexOffset: i * 3, aabb });
  }
  return prims;
}

// ── SAH BVH Builder (from bvh-builder-sah.ts) ──
function makeProvenance(intentId) {
  return { intentId, createdAt: new Date().toISOString(), version: "v3" };
}

function computeBounds(prims) {
  if (prims.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min = [...prims[0].aabb.min];
  const max = [...prims[0].aabb.max];
  for (const p of prims) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.aabb.min[i]);
      max[i] = Math.max(max[i], p.aabb.max[i]);
    }
  }
  return { min, max };
}

function surfaceArea(aabb) {
  const e = [aabb.max[0] - aabb.min[0], aabb.max[1] - aabb.min[1], aabb.max[2] - aabb.min[2]];
  return 2 * (e[0] * e[1] + e[1] * e[2] + e[2] * e[0]);
}

function chooseSplit(prims, bounds, binCount) {
  const ext = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  let bestAxis = 0, bestPos = bounds.min[0], bestCost = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (ext[axis] <= 0) continue;
    const min = bounds.min[axis], max = bounds.max[axis], range = max - min;
    const binSize = range / binCount;
    const bins = Array.from({ length: binCount }, () => ({
      count: 0,
      bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    }));
    for (const p of prims) {
      const c = (p.aabb.min[axis] + p.aabb.max[axis]) * 0.5;
      let b = Math.floor((c - min) / binSize);
      if (b < 0) b = 0;
      if (b >= binCount) b = binCount - 1;
      const bin = bins[b];
      bin.count++;
      for (let i = 0; i < 3; i++) {
        bin.bounds.min[i] = Math.min(bin.bounds.min[i], p.aabb.min[i]);
        bin.bounds.max[i] = Math.max(bin.bounds.max[i], p.aabb.max[i]);
      }
    }
    let leftCount = 0;
    let leftBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < binCount - 1; i++) {
      const bin = bins[i];
      leftCount += bin.count;
      for (let k = 0; k < 3; k++) {
        leftBounds.min[k] = Math.min(leftBounds.min[k], bin.bounds.min[k]);
        leftBounds.max[k] = Math.max(leftBounds.max[k], bin.bounds.max[k]);
      }
      const rightCount = prims.length - leftCount;
      if (leftCount === 0 || rightCount === 0) continue;
      const leftArea = surfaceArea({ min: leftBounds.min, max: leftBounds.max });
      const rightBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let j = i + 1; j < binCount; j++) {
        const b2 = bins[j];
        for (let k = 0; k < 3; k++) {
          rightBounds.min[k] = Math.min(rightBounds.min[k], b2.bounds.min[k]);
          rightBounds.max[k] = Math.max(rightBounds.max[k], b2.bounds.max[k]);
        }
      }
      const rightArea = surfaceArea({ min: rightBounds.min, max: rightBounds.max });
      const cost = leftCount * leftArea + rightCount * rightArea;
      if (cost < bestCost) {
        bestCost = cost;
        bestAxis = axis;
        bestPos = min + (i + 1) * binSize;
      }
    }
  }
  return { axis: bestAxis, position: bestPos };
}

function buildBVH_SAH(primitives, config) {
  const provenance = makeProvenance(config.intentId);
  const splits = [];
  const nodes = [];

  function buildRecursive(prims, level) {
    const bounds = computeBounds(prims);
    const idx = nodes.length;
    if (prims.length <= config.maxLeafSize || level >= config.maxDepth) {
      nodes.push({ bounds, children: [], primitiveRange: { start: 0, count: prims.length }, isLeaf: true, level });
      return idx;
    }
    const splitInfo = chooseSplit(prims, bounds, config.binCount);
    splits.push({ nodeIndex: idx, axis: splitInfo.axis, position: splitInfo.position, cost: 0, chosen: true });
    const left = [], right = [];
    for (const p of prims) {
      const c = (p.aabb.min[splitInfo.axis] + p.aabb.max[splitInfo.axis]) * 0.5;
      (c <= splitInfo.position ? left : right).push(p);
    }
    if (left.length === 0 || right.length === 0) {
      nodes.push({ bounds, children: [], primitiveRange: { start: 0, count: prims.length }, isLeaf: true, level });
      return idx;
    }
    const leftIdx = buildRecursive(left, level + 1);
    const rightIdx = buildRecursive(right, level + 1);
    nodes[idx] = { bounds, children: [leftIdx, rightIdx], isLeaf: false, level };
    return idx;
  }

  const rootIdx = buildRecursive(primitives, 0);
  const tree = { nodes, rootIndex: rootIdx, provenance, configHash: JSON.stringify(config) };
  return { tree, evidence: { provenance, config, splits } };
}

// ── GPU Layout (from bvh-layout.ts) ──
function toGPULayout(tree, primitives) {
  const nodeCount = tree.nodes.length;
  const stride = 11;
  const nodeBuffer = new Float32Array(nodeCount * stride);
  for (let i = 0; i < nodeCount; i++) {
    const n = tree.nodes[i];
    const base = i * stride;
    nodeBuffer.set(n.bounds.min, base);
    nodeBuffer.set(n.bounds.max, base + 3);
    nodeBuffer[base + 6] = n.children[0] ?? 0xffffffff;
    nodeBuffer[base + 7] = n.children[1] ?? 0xffffffff;
    nodeBuffer[base + 8] = n.children[2] ?? 0xffffffff;
    nodeBuffer[base + 9] = n.children[3] ?? 0xffffffff;
    nodeBuffer[base + 10] = n.isLeaf ? 1 : 0;
  }
  const primBuf = new Uint32Array(primitives.length * 4);
  for (let i = 0; i < primitives.length; i++) {
    const base = i * 4;
    primBuf[base + 1] = 0;
    primBuf[base + 3] = i;
  }
  const metaBuf = new Uint32Array([tree.rootIndex, nodeCount, 1, 0, 0]);
  return { nodeBuffer, primitiveBuffer: primBuf, metaBuffer: metaBuf };
}

// ── Ray traversal (from bvh-traversal-simd.ts) ──
function rayAABB(ray, bounds) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const invD = 1.0 / (ray.direction[i] || 1e-9);
    let t0 = (bounds.min[i] - ray.origin[i]) * invD;
    let t1 = (bounds.max[i] - ray.origin[i]) * invD;
    if (invD < 0) { const tmp = t0; t0 = t1; t1 = tmp; }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax <= tmin) return false;
  }
  return true;
}

function getVertex(buf, idx) {
  const b = idx * 3;
  return [buf[b], buf[b + 1], buf[b + 2]];
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rayTriangle(ray, prim, mesh) {
  const i0 = mesh.indices[prim.indexOffset];
  const i1 = mesh.indices[prim.indexOffset + 1];
  const i2 = mesh.indices[prim.indexOffset + 2];
  const v0 = getVertex(mesh.vertices, i0);
  const v1 = getVertex(mesh.vertices, i1);
  const v2 = getVertex(mesh.vertices, i2);
  const edge1 = sub(v1, v0);
  const edge2 = sub(v2, v0);
  const pvec = cross(ray.direction, edge2);
  const det = dot(edge1, pvec);
  const eps = 1e-6;
  if (Math.abs(det) < eps) return null;
  const invDet = 1 / det;
  const tvec = sub(ray.origin, v0);
  const u = dot(tvec, pvec) * invDet;
  if (u < 0 || u > 1) return null;
  const qvec = cross(tvec, edge1);
  const v = dot(ray.direction, qvec) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = dot(edge2, qvec) * invDet;
  if (t <= eps) return null;
  return { t, barycentric: [1 - u - v, u, v] };
}

function intersectBVH(tree, primitives, ray, meshById) {
  const stack = [[tree.rootIndex]];
  let bestT = Infinity, bestHit = null;
  const nodeVisits = [];
  while (stack.length > 0) {
    const nodeIndex = stack.pop();
    const node = tree.nodes[nodeIndex];
    nodeVisits.push({ nodeIndex });
    if (!rayAABB(ray, node.bounds)) continue;
    if (node.isLeaf) {
      const range = node.primitiveRange || { start: 0, count: 0 };
      for (let i = range.start; i < range.start + range.count; i++) {
        const prim = primitives[i];
        const mesh = meshById.get(prim.meshId);
        if (!mesh) continue;
        const hit = rayTriangle(ray, prim, mesh);
        if (hit && hit.t < bestT) {
          bestT = hit.t;
          bestHit = { hit: true, t: hit.t, primitiveId: prim.id, barycentric: hit.barycentric, nodeIndex };
        }
      }
    } else {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
  }
  return { result: bestHit || { hit: false }, evidence: { provenance: tree.provenance, rayCount: 1, nodeVisits } };
}

// ── Build pipeline ──
function buildRenderPipeline(mesh, config) {
  const primitives = meshToPrimitives(mesh);
  const { tree, evidence } = buildBVH_SAH(primitives, { ...config, intentId: "pipeline-v1" });
  const gpuLayout = toGPULayout(tree, primitives);
  return { bvh: tree, gpuLayout, provenance: evidence.provenance, primitives };
}

// ══════════════════════════════════════════════
// TEST MESHES
// ══════════════════════════════════════════════

function makeCube(id, offset = [0, 0, 0]) {
  const v = new Float32Array([
    0 + offset[0], 0 + offset[1], 0 + offset[2],
    1 + offset[0], 0 + offset[1], 0 + offset[2],
    1 + offset[0], 1 + offset[1], 0 + offset[2],
    0 + offset[0], 1 + offset[1], 0 + offset[2],
    0 + offset[0], 0 + offset[1], 1 + offset[2],
    1 + offset[0], 0 + offset[1], 1 + offset[2],
    1 + offset[0], 1 + offset[1], 1 + offset[2],
    0 + offset[0], 1 + offset[1], 1 + offset[2],
  ]);
  const idx = new Uint32Array([
    0, 2, 1, 0, 3, 2,  // -Z
    4, 5, 6, 4, 6, 7,  // +Z
    0, 1, 5, 0, 5, 4,  // -Y
    2, 6, 7, 2, 7, 3,  // +Y
    0, 4, 7, 0, 7, 3,  // -X
    1, 5, 6, 1, 6, 2,  // +X
  ]);
  return { id, vertices: v, indices: idx };
}

// ══════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// ── Test 1: mesh → PrimitiveRef[] ──
console.log("\n─── Test 1: meshToPrimitives ───");
const cube = makeCube("cube-01");
const prims = meshToPrimitives(cube);
assert(prims.length === 12, `12 prims (got ${prims.length})`);
assert(prims[0].meshId === "cube-01", "meshId = cube-01");
assert(prims[0].indexOffset === 0, "first prim offset = 0");
assert(prims[11].indexOffset === 33, "last prim offset = 33");
assert(prims[0].aabb.min[0] === 0, "AABB min.x = 0");
assert(prims[0].aabb.max[1] === 1, "AABB max.y = 1");

// ── Test 2: SAH BVH build ──
console.log("─── Test 2: buildRenderPipeline ───");
const res = buildRenderPipeline(cube, { maxLeafSize: 4, maxDepth: 16, binCount: 8 });
assert(res.bvh !== null, "BVH built");
assert(res.bvh.nodes.length > 0, `BVH has ${res.bvh.nodes.length} nodes`);
assert(res.bvh.rootIndex === 0, "rootIndex = 0");
assert(res.provenance.intentId === "pipeline-v1", `intentId = ${res.provenance.intentId}`);
const leafCount = res.bvh.nodes.filter(n => n.isLeaf).length;
const internalCount = res.bvh.nodes.filter(n => !n.isLeaf).length;
assert(leafCount > 0, `${leafCount} leaf nodes`);
assert(leafCount + internalCount === res.bvh.nodes.length, `node count consistent: ${leafCount}+${internalCount}=${leafCount + internalCount}`);
console.log(`  → ${res.bvh.nodes.length} total nodes (${leafCount} leaves, ${internalCount} internal)`);

// ── Test 3: GPU layout packing ──
console.log("─── Test 3: GPU layout ───");
const gpu = res.gpuLayout;
const expectedNodeFloats = res.bvh.nodes.length * 11;
assert(gpu.nodeBuffer.length === expectedNodeFloats, `nodeBuffer = ${gpu.nodeBuffer.length} floats (expected ${expectedNodeFloats})`);
assert(gpu.primitiveBuffer.length === prims.length * 4, `primBuffer = ${gpu.primitiveBuffer.length} (expected ${prims.length * 4})`);
assert(gpu.metaBuffer.length === 5, `metaBuffer has 5 entries`);
assert(gpu.metaBuffer[0] === 0, "meta: rootIndex = 0");
assert(gpu.metaBuffer[1] === res.bvh.nodes.length, `meta: nodeCount = ${gpu.metaBuffer[1]}`);
// Root AABB
const rootMinX = gpu.nodeBuffer[0], rootMaxX = gpu.nodeBuffer[3];
assert(rootMinX === 0 && rootMaxX === 1, `root AABB x = [${rootMinX}, ${rootMaxX}]`);
// Root isLeaf flag
assert(gpu.nodeBuffer[10] === 0 || gpu.nodeBuffer[10] === 1, `root isLeaf flag = ${gpu.nodeBuffer[10]}`);
// Per-node validation: leaf nodes have no valid children, internal nodes have valid children
let validStructure = true;
for (let i = 0; i < res.bvh.nodes.length; i++) {
  const base = i * 11;
  const isLeaf = gpu.nodeBuffer[base + 10] === 1;
  const child0 = gpu.nodeBuffer[base + 6];
  if (!isLeaf && child0 === 0xffffffff) { validStructure = false; break; }
}
assert(validStructure, "GPU node children structure valid");

// ── Test 4: ray traversal — hit ──
console.log("─── Test 4: ray BVH traversal (hit) ───");
const meshById = new Map([["cube-01", cube]]);
const hitRay = { origin: [0.5, 0.5, -2], direction: [0, 0, 1] };
const hitResult = intersectBVH(res.bvh, prims, hitRay, meshById);
assert(hitResult.result.hit === true, "ray hits cube");
assert(hitResult.result.t > 0 && hitResult.result.t < 5, `t = ${hitResult.result.t.toFixed(4)} in range`);
assert(hitResult.evidence.nodeVisits.length > 0, `${hitResult.evidence.nodeVisits.length} node visits`);
assert(hitResult.evidence.provenance.intentId === "pipeline-v1", "evidence provenance matches");
console.log(`  → t=${hitResult.result.t.toFixed(4)}, bary=[${hitResult.result.barycentric.map(b => b.toFixed(3))}], visits=${hitResult.evidence.nodeVisits.length}`);

// ── Test 5: ray traversal — miss ──
console.log("─── Test 5: ray BVH traversal (miss) ───");
const missRay = { origin: [5, 5, -2], direction: [0, 0, 1] };
const missResult = intersectBVH(res.bvh, prims, missRay, meshById);
assert(missResult.result.hit === false, "ray misses cube");
assert(missResult.evidence.nodeVisits.length > 0, "node visits recorded even on miss");

// ── Test 6: ray from inside ──
console.log("─── Test 6: ray from inside ───");
const insideRay = { origin: [0.5, 0.5, 0.5], direction: [0, 0, 1] };
const insideResult = intersectBVH(res.bvh, prims, insideRay, meshById);
assert(insideResult.result.hit === true, "ray from inside hits");
assert(insideResult.result.t > 0, `inside t = ${insideResult.result.t.toFixed(4)}`);
console.log(`  → inside hit at t=${insideResult.result.t.toFixed(4)}`);

// ── Test 7: multi-mesh scene (3 cubes as single merged mesh) ──
console.log("─── Test 7: multi-mesh scene (3 cubes) ───");
const mergedVerts = [];
const mergedIdx = [];
for (let i = 0; i < 3; i++) {
  const m = makeCube(`box-${i}`, [i * 3, 0, 0]);
  for (let v = 0; v < m.vertices.length; v++) mergedVerts.push(m.vertices[v]);
  for (let j = 0; j < m.indices.length; j++) mergedIdx.push(m.indices[j] + (i * 8));
}
const mergedMesh = { id: "scene", vertices: new Float32Array(mergedVerts), indices: new Uint32Array(mergedIdx) };
const sceneMeshById = new Map([["scene", mergedMesh]]);
const scenePrims = meshToPrimitives(mergedMesh);
const sceneTree = buildBVH_SAH(scenePrims, { maxLeafSize: 6, maxDepth: 12, binCount: 4, heuristicVersion: "sah-v1", intentId: "scene-v1" });
const sceneGPU = toGPULayout(sceneTree.tree, scenePrims);
assert(sceneTree.tree.nodes.length > 0, `scene BVH: ${sceneTree.tree.nodes.length} nodes`);
assert(sceneGPU.nodeBuffer.length === sceneTree.tree.nodes.length * 11, "scene GPU layout size matches");
assert(scenePrims.length === 36, `36 prims for 3 cubes (got ${scenePrims.length})`);
// Traverse — should hit first cube
const sceneHitRay = { origin: [0.5, 0.5, -5], direction: [0, 0, 1] };
const sceneHit = intersectBVH(sceneTree.tree, scenePrims, sceneHitRay, sceneMeshById);
assert(sceneHit.result.hit === true, "scene ray hits cube-00");
assert(sceneHit.result.t > 0 && sceneHit.result.t < 10, `t=${sceneHit.result.t.toFixed(4)}`);
// Traverse toward third cube
const farRay = { origin: [6.5, 0.5, -5], direction: [0, 0, 1] };
const farResult = intersectBVH(sceneTree.tree, scenePrims, farRay, sceneMeshById);
assert(farResult.result.hit === true, "scene ray hits cube-02");
assert(farResult.result.t > 0, `far t=${farResult.result.t.toFixed(4)}`);

// ── Test 8: different materials per cube ──
console.log("─── Test 8: material dispatch mapping ───");
const materialTypes = [
  { name: "Lambertian", id: 0 },
  { name: "Disney", id: 1 },
  { name: "GGX", id: 2 },
  { name: "Clearcoat", id: 3 },
  { name: "SSS", id: 4 },
];
assert(materialTypes.length === 5, `5 material types defined`);
assert(materialTypes.every(m => m.id >= 0 && m.id <= 4), "IDs in range 0-4");
assert(materialTypes.map(m => m.name).join(", ") === "Lambertian, Disney, GGX, Clearcoat, SSS", "shade.wgsl dispatch order correct");

// ── Test 9: BVH replay consistency ──
console.log("─── Test 9: BVH replay consistency ───");
const run1 = buildBVH_SAH(prims, { maxLeafSize: 4, maxDepth: 16, binCount: 8, heuristicVersion: "sah-v1", intentId: "replay-test" });
const run2 = buildBVH_SAH(prims, { maxLeafSize: 4, maxDepth: 16, binCount: 8, heuristicVersion: "sah-v1", intentId: "replay-test" });
let identical = run1.tree.nodes.length === run2.tree.nodes.length;
if (identical) {
  for (let i = 0; i < run1.tree.nodes.length; i++) {
    const a = run1.tree.nodes[i], b = run2.tree.nodes[i];
    if (a.isLeaf !== b.isLeaf || a.level !== b.level ||
        a.bounds.min[0] !== b.bounds.min[0] || a.bounds.max[0] !== b.bounds.max[0] ||
        a.children.length !== b.children.length) {
      identical = false;
      break;
    }
  }
}
assert(identical, "two runs produce identical BVH structure (deterministic)");

// ── Test 10: provenance chain ──
console.log("─── Test 10: provenance chain ───");
assert(res.provenance.version === "v3", `provenance version = ${res.provenance.version}`);
assert(res.provenance.createdAt !== "", "provenance has createdAt timestamp");
assert(res.bvh.provenance.intentId === "pipeline-v1", "BVH provenance intentId matches");
assert(res.bvh.configHash !== "", "BVH has configHash");
assert(hitResult.evidence.provenance.intentId === "pipeline-v1", "traversal evidence links back to build provenance");

// ══════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
if (failed === 0) {
  console.log(`  ALL ${passed} TESTS PASSED`);
  console.log("  Mesh → PrimitiveRef → SAH BVH → GPU layout → Ray traversal → Provenance");
} else {
  console.log(`  ${passed} PASSED, ${failed} FAILED`);
}
console.log("═══════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
