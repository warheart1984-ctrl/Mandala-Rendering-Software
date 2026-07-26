import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBody } from "../../src/world/Body.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";
import { DefaultBodyRegistry } from "../../src/world/BodyRegistry.js";
import { SimplePhysicsEngine } from "../../src/physics/PhysicsEngine.js";
import { vec3 } from "../../src/world/Vec3.js";

describe("world-body", () => {
  it("applyForce accumulates; physics integrates position", () => {
    const body = new DefaultBody("b1", vec3(0, 0, 0), vec3(0, 0, 0), 2);
    body.applyForce(0, 20, 0);
    assert.equal(body.forceAccum.y, 20);
    const physics = new SimplePhysicsEngine();
    physics.step(0.5, [body]);
    // a = 20/2 = 10; v = 10*0.5 = 5; p = 5*0.5 = 2.5
    assert.equal(body.velocity.y, 5);
    assert.equal(body.position.y, 2.5);
    assert.equal(body.forceAccum.y, 0);
  });

  it("addBody/removeBody and registry resolve", () => {
    const mesh = new DefaultWorldMesh(
      new Float32Array(),
      new Float32Array(),
      new Uint32Array(),
    );
    const world = new DefaultWorld3D(mesh);
    const reg = new DefaultBodyRegistry();
    const a = new DefaultBody("a", vec3(), vec3(), 1);
    const b = new DefaultBody("b", vec3(1, 0, 0), vec3(), 1);
    world.addBody(a);
    world.addBody(b);
    reg.register(a);
    reg.register(b);
    assert.equal(world.bodies.length, 2);
    assert.equal(reg.resolve("a"), a);
    world.removeBody("a");
    reg.unregister("a");
    assert.equal(world.bodies.length, 1);
    assert.equal(reg.resolve("a"), undefined);
    assert.deepEqual(
      reg.collectBodies().map((x) => x.id),
      ["b"],
    );
  });
});
