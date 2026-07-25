/**
 * EI-TOPOLOGY: BVH4D parent/child containment + ray-miss implication.
 * Proves M-BVH-CONTAINMENT on built BVH4D trees.
 * Run: node src/render/rt4d/test/invariants.topology.test.js
 */
import assert from "assert";
import { BVH4D } from "../accel/BVH4D.js";
import { HyperBox } from "../accel/HyperBox.js";
import { Hypersphere } from "../geometry/hypersurface.js";
import { vec4 } from "../math/vec4.js";
import {
  topologyPreservationHolds,
  hyperBoxContained,
  bvhMissImplicationHolds,
  buildDefaultTopologyBVH,
} from "../invariants/index.js";

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

/** Deterministic scene of hyperspheres forcing a multi-level tree. */
function makeScene(count = 24, leafThreshold = 2) {
  let s = 0x4d5253 >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const prims = [];
  for (let i = 0; i < count; i++) {
    const c = vec4(
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
    );
    prims.push(new Hypersphere(c, 0.2 + rng() * 1.5));
  }
  return new BVH4D(prims, { leafThreshold });
}

console.log("\n--- EI-TOPOLOGY: BVH4D containment ---");

test("hyperBoxContained: nested box is contained", () => {
  const parent = new HyperBox();
  parent.expand(vec4(-1, -1, -1, -1));
  parent.expand(vec4(1, 1, 1, 1));
  const child = new HyperBox();
  child.expand(vec4(-0.5, -0.5, -0.5, -0.5));
  child.expand(vec4(0.5, 0.5, 0.5, 0.5));
  assert.strictEqual(hyperBoxContained(child, parent), true);
});

test("hyperBoxContained: overhanging box is NOT contained", () => {
  const parent = new HyperBox();
  parent.expand(vec4(-1, -1, -1, -1));
  parent.expand(vec4(1, 1, 1, 1));
  const child = new HyperBox();
  child.expand(vec4(-0.5, -0.5, -0.5, -0.5));
  child.expand(vec4(0.5, 0.5, 0.5, 1.5)); // w-axis overhang
  assert.strictEqual(hyperBoxContained(child, parent), false);
});

test("built BVH: every child box ⊆ parent box (multi-level)", () => {
  const bvh = makeScene(24, 2);
  // Confirm the tree is actually multi-level so containment is non-trivial.
  const internal = bvh.nodes.filter((n) => n.left >= 0 || n.right >= 0);
  assert.ok(internal.length >= 3, `expected internal nodes, got ${internal.length}`);
  const r = topologyPreservationHolds(bvh, { checkMissImplication: false });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.violations.length, 0);
  assert.ok(r.checkedPairs >= internal.length);
});

test("built BVH: ray-miss on a node implies miss on all descendants", () => {
  const bvh = makeScene(24, 2);
  const miss = bvhMissImplicationHolds(bvh, { rays: 512 });
  assert.strictEqual(miss.ok, true, `violations=${miss.violations}`);
  assert.ok(miss.missChecks > 0, "expected some rays to miss at least one node");
});

test("topologyPreservationHolds combines containment + miss implication", () => {
  const bvh = makeScene(16, 4);
  const r = topologyPreservationHolds(bvh);
  assert.strictEqual(r.status, "tested");
  assert.strictEqual(r.ok, true);
  assert.ok(r.missImplication && r.missImplication.ok);
});

test("default tree (no arg) evaluates as tested pass", () => {
  const r = topologyPreservationHolds();
  assert.strictEqual(r.ok, true);
  assert.ok(r.nodeCount > 1);
  assert.strictEqual(r.violations.length, 0);
});

test("buildDefaultTopologyBVH produces a multi-level tree", () => {
  const bvh = buildDefaultTopologyBVH();
  assert.ok(bvh.nodes.length > 3);
  const internal = bvh.nodes.filter((n) => n.left >= 0 || n.right >= 0);
  assert.ok(internal.length >= 1);
});

test("corrupted child box is detected as a containment violation", () => {
  const bvh = makeScene(16, 2);
  // Find an internal node and enlarge one child box beyond its parent.
  const parentIdx = bvh.nodes.findIndex((n) => n.left >= 0);
  const childIdx = bvh.nodes[parentIdx].left;
  bvh.nodes[childIdx].box.expand(
    vec4(1e6, 1e6, 1e6, 1e6),
  );
  const r = topologyPreservationHolds(bvh, { checkMissImplication: false });
  assert.strictEqual(r.ok, false);
  assert.ok(r.violations.some((v) => v.child === childIdx));
});

test("partition fix: traversal still returns the nearest hit", () => {
  // Two well-separated spheres along +x; a +x ray must hit the nearer one.
  const near = new Hypersphere(vec4(2, 0, 0, 0), 0.5);
  const far = new Hypersphere(vec4(8, 0, 0, 0), 0.5);
  // Pad with extra spheres to force splitting.
  const prims = [far, near];
  for (let i = 0; i < 8; i++) {
    prims.push(new Hypersphere(vec4(0, i - 4, 5 + i, -3), 0.3));
  }
  const bvh = new BVH4D(prims, { leafThreshold: 2 });
  const ray = {
    origin: vec4(-5, 0, 0, 0),
    direction: vec4(1, 0, 0, 0),
    tMin: 1e-4,
    tMax: Infinity,
  };
  const hit = bvh.traverse(ray);
  assert.ok(hit, "expected a hit");
  // Nearest intersection is the front face of the near sphere at x≈1.5 → t≈6.5.
  assert.ok(Math.abs(hit.t - 6.5) < 1e-6, `t=${hit.t}`);
});

console.log(`\n=== EI-TOPOLOGY topology: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
