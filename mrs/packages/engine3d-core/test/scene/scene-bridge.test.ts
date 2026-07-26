import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBody } from "../../src/world/Body.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";
import { vec3 } from "../../src/world/Vec3.js";
import {
  Engine3DSceneBridge,
  captureEngine3DScene,
  hashCanonical,
  renderEngine3dFrame,
} from "../../src/scene/index.js";

function makeWorld() {
  const mesh = new DefaultWorldMesh(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    new Float32Array(12),
    new Uint32Array([0, 1, 2]),
  );
  const world = new DefaultWorld3D(mesh);
  world.addBody(new DefaultBody("a", vec3(0.5, 0.1, -0.2), vec3(0.1, 0, 0), 1));
  world.addBody(new DefaultBody("b", vec3(-1, 0.4, 0.3), vec3(), 8));
  return world;
}

describe("Engine3DSceneBridge", () => {
  it("same world+seed+frame → identical scene JSON + evidence hashes", () => {
    const world = makeWorld();
    const visualMod = {
      colors: new Float32Array([1, 0, 0, 1]),
      scales: new Float32Array([1]),
      shaderParams: { glyphIntensity: 0.42, glyphCount: 3 },
    };
    const input = {
      world,
      frameIndex: 7,
      seed: 0xabcd,
      visualMod,
    };
    const a = captureEngine3DScene(input);
    const b = captureEngine3DScene(input);
    assert.equal(a.evidence.sceneHash, b.evidence.sceneHash);
    assert.equal(a.evidence.worldHash, b.evidence.worldHash);
    assert.equal(a.evidence.cameraHash, b.evidence.cameraHash);
    assert.equal(a.evidence.latticeHash, b.evidence.latticeHash);
    assert.deepEqual(a.scene, b.scene);
    assert.deepEqual(a.evidence, b.evidence);
  });

  it("capture does not mutate body positions", () => {
    const world = makeWorld();
    const before = world.bodies.map((body) => ({
      id: body.id,
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
      vx: body.velocity.x,
    }));
    captureEngine3DScene({ world, frameIndex: 0, seed: 1 });
    const after = world.bodies.map((body) => ({
      id: body.id,
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
      vx: body.velocity.x,
    }));
    assert.deepEqual(after, before);
  });

  it("evidence includes required fields", () => {
    const world = makeWorld();
    const { evidence, scene } = new Engine3DSceneBridge().capture({
      world,
      frameIndex: 2,
      seed: 99,
    });
    assert.equal(evidence.frameIndex, 2);
    assert.equal(evidence.seed, 99);
    assert.equal(typeof evidence.worldHash, "string");
    assert.match(evidence.worldHash, /^[0-9a-f]{8}$/);
    assert.equal(typeof evidence.cameraHash, "string");
    assert.equal(typeof evidence.latticeHash, "string");
    assert.equal(typeof evidence.sceneHash, "string");
    assert.equal(evidence.primitiveCount, scene.primitives.length);
    assert.ok(evidence.primitiveCount >= 2); // two bodies minimum
    assert.equal(scene.mappingNotes.polyMeshTriangles, "declared");
    assert.equal(scene.schemaVersion, "engine3d-bridge-scene/1.0");
  });

  it("maps heavier bodies to larger sphere radii", () => {
    const world = makeWorld();
    const { scene } = captureEngine3DScene({ world, frameIndex: 0, seed: 0 });
    const a = scene.primitives.find((p) => p.id === "body:a");
    const b = scene.primitives.find((p) => p.id === "body:b");
    assert.ok(a && b);
    assert.ok(b!.radius > a!.radius);
  });

  it("caps mesh vertex samples", () => {
    const verts = new Float32Array(300); // 100 verts
    for (let i = 0; i < verts.length; i++) verts[i] = i * 0.01;
    const world = new DefaultWorld3D(
      new DefaultWorldMesh(verts, new Float32Array(300), new Uint32Array()),
    );
    const { scene } = captureEngine3DScene({
      world,
      frameIndex: 0,
      seed: 1,
      options: { maxMeshSamples: 10 },
    });
    const meshPrims = scene.primitives.filter((p) => p.source === "mesh_vertex");
    assert.equal(meshPrims.length, 10);
  });

  it("headless renderEngine3dFrame receipt is deterministic", () => {
    const world = makeWorld();
    const captured = captureEngine3DScene({ world, frameIndex: 1, seed: 42 });
    const r1 = renderEngine3dFrame(captured);
    const r2 = renderEngine3dFrame(captured);
    assert.equal(r1.receiptHash, r2.receiptHash);
    assert.equal(r1.sceneHash, captured.evidence.sceneHash);
    assert.equal(r1.mode, "null-headless");
    assert.equal(r1.imageStatus, "not_rendered_headless");
    assert.equal(r1.receiptHash, hashCanonical({
      schemaVersion: r1.schemaVersion,
      mode: r1.mode,
      sceneHash: r1.sceneHash,
      evidenceHash: r1.evidenceHash,
      primitiveCount: r1.primitiveCount,
      imageStatus: r1.imageStatus,
    }));
  });
});
