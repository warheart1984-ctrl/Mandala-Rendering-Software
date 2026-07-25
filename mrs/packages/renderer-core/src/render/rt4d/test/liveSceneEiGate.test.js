/**
 * Live-scene EI-TOPOLOGY gate (soft attach / opt-in deny).
 * Run: node src/render/rt4d/test/liveSceneEiGate.test.js
 */
import assert from "assert";
import { Scene4D } from "../scene/Scene4D.js";
import { Hypersphere } from "../geometry/hypersurface.js";
import { Camera4D } from "../camera/Camera4D.js";
import { vec4 } from "../math/vec4.js";
import { createHyperCausticLens } from "../scene/TestHyperCausticLens.js";
import { BVH4D } from "../accel/BVH4D.js";
import { renderRT4DFrame, renderRT4DFrameWavefront } from "../RT4DRenderer.js";
import {
  evaluateLiveSceneTopology,
  runLiveSceneEiGate,
  LiveSceneEiGateError,
} from "../pipeline/LiveSceneEiGate.js";
import { cpuPathTracerHashDeterministic } from "../pipeline/PathTracerSeedHash.js";

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

function buildBoundedScene(n = 8) {
  const scene = new Scene4D();
  for (let i = 0; i < n; i++) {
    const c = vec4(
      (i % 3) - 1,
      ((i * 2) % 5) - 2,
      ((i * 3) % 4) - 1.5,
      (i % 2) - 0.5,
    );
    scene.addPrimitive(new Hypersphere(c, 0.4 + (i % 3) * 0.1), "default");
  }
  scene.build();
  return scene;
}

/** Corrupt parent/child containment for deny-path tests. */
function breakBvhContainment(bvh) {
  const root = bvh.nodes[0];
  if (root.left < 0) return false;
  const child = bvh.nodes[root.left];
  const box = child.box;
  box.min = vec4(box.min.x - 10, box.min.y, box.min.z, box.min.w);
  box.max = vec4(box.max.x + 10, box.max.y, box.max.z, box.max.w);
  return true;
}

console.log("\n--- Live-scene EI gate ---");

test("default: gate disabled returns null", () => {
  const scene = buildBoundedScene();
  assert.strictEqual(runLiveSceneEiGate(scene, { log: false }), null);
});

test("evaluateLiveSceneTopology skips without BVH", () => {
  const scene = new Scene4D();
  const r = evaluateLiveSceneTopology(scene);
  assert.strictEqual(r.ok, null);
  assert.strictEqual(r.status, "skipped");
  assert.ok(r.reason.includes("scene.bvh"));
});

test("soft runEiGate passes on live built scene", () => {
  const scene = buildBoundedScene(12);
  const gate = runLiveSceneEiGate(scene, {
    runEiGate: true,
    topologyRays: 32,
    log: false,
  });
  assert.ok(gate);
  assert.strictEqual(gate.verdict, "attach");
  assert.strictEqual(gate.status, "accepted");
  assert.strictEqual(gate.topology.ok, true);
  assert.strictEqual(gate.evidence.verdict, "pass");
  assert.strictEqual(gate.evidence.invariantId, "EI-TOPOLOGY");
  assert.strictEqual(gate.evidence.runtimeId, "rt4d-live-scene");
});

test("soft attach still returns on topology fail (no throw)", () => {
  const scene = buildBoundedScene(12);
  assert.ok(breakBvhContainment(scene.bvh));
  const gate = runLiveSceneEiGate(scene, {
    runEiGate: true,
    checkMissImplication: false,
    log: false,
  });
  assert.strictEqual(gate.topology.ok, false);
  assert.strictEqual(gate.verdict, "attach");
  assert.strictEqual(gate.status, "accepted");
  assert.strictEqual(gate.evidence.verdict, "fail");
});

test("enforce denies on topology fail", () => {
  const scene = buildBoundedScene(12);
  assert.ok(breakBvhContainment(scene.bvh));
  assert.throws(
    () =>
      runLiveSceneEiGate(scene, {
        enforceEngineInvariantTopology: true,
        checkMissImplication: false,
        log: false,
      }),
    (err) => {
      assert.ok(err instanceof LiveSceneEiGateError);
      assert.ok(err.message.includes("DENY"));
      assert.strictEqual(err.details.topology.ok, false);
      return true;
    },
  );
});

test("enforce denies when BVH missing", () => {
  const scene = new Scene4D();
  assert.throws(
    () =>
      runLiveSceneEiGate(scene, {
        enforceEngineInvariantTopology: true,
        log: false,
      }),
    LiveSceneEiGateError,
  );
});

test("hyper-caustic lens scene has evaluable BVH", () => {
  const { scene } = createHyperCausticLens({ width: 8, height: 8 });
  assert.ok(scene.bvh instanceof BVH4D);
  assert.ok(scene.bvh.nodes.length > 0);
  const r = evaluateLiveSceneTopology(scene, { rays: 32 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.nodeCount >= 1);
});

await testAsync("renderRT4DFrame soft-attaches eiGate when runEiGate", async () => {
  const scene = buildBoundedScene(6);
  const camera = new Camera4D({ width: 4, height: 4, z: -3 });
  const frame = await renderRT4DFrame(scene, camera, {
    width: 4,
    height: 4,
    samples: 1,
    maxDepth: 1,
    seed: 42,
    runEiGate: true,
    topologyRays: 16,
    checkMissImplication: false,
  });
  assert.ok(frame.eiGate);
  assert.strictEqual(frame.eiGate.topology.ok, true);
  assert.ok(frame.pixels);
});

await testAsync("renderRT4DFrame default leaves eiGate null", async () => {
  const scene = buildBoundedScene(4);
  const camera = new Camera4D({ width: 2, height: 2, z: -3 });
  const frame = await renderRT4DFrame(scene, camera, {
    width: 2,
    height: 2,
    samples: 1,
    maxDepth: 1,
    seed: 7,
  });
  assert.strictEqual(frame.eiGate, null);
});

await testAsync("renderRT4DFrame enforce throws before tracing", async () => {
  const scene = buildBoundedScene(8);
  breakBvhContainment(scene.bvh);
  const camera = new Camera4D({ width: 2, height: 2, z: -3 });
  await assert.rejects(
    () =>
      renderRT4DFrame(scene, camera, {
        width: 2,
        height: 2,
        samples: 1,
        maxDepth: 1,
        seed: 1,
        enforceEngineInvariantTopology: true,
        checkMissImplication: false,
      }),
    LiveSceneEiGateError,
  );
});

await testAsync("wavefront path accepts scene4D for EI gate", async () => {
  const scene = buildBoundedScene(6);
  const camera = new Camera4D({ width: 4, height: 4 });
  const frame = await renderRT4DFrameWavefront(scene, camera, {
    width: 4,
    height: 4,
    seed: 0x4d5253,
    runEiGate: true,
    topologyRays: 16,
    checkMissImplication: false,
    runConformance: false,
  });
  assert.ok(frame.eiGate);
  assert.strictEqual(frame.eiGate.topology.ok, true);
  assert.strictEqual(frame.engineMode, "wavefront");
});

test("cpuPathTracerHashDeterministic: same seed → same hash", () => {
  const r = cpuPathTracerHashDeterministic({
    width: 4,
    height: 4,
    samples: 1,
    maxDepth: 2,
    seed: 0x4d5253,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.hashA, r.hashB);
  assert.strictEqual(r.kind, "cpu-path-tracer-seed-hash");
});

console.log(`\n=== live-scene EI gate: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
