import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBody } from "../../src/world/Body.js";
import { SimplePhysicsEngine } from "../../src/physics/PhysicsEngine.js";
import { vec3 } from "../../src/world/Vec3.js";

describe("physics-step", () => {
  it("is deterministic for identical inputs", () => {
    const physics = new SimplePhysicsEngine();
    function run() {
      const b = new DefaultBody("b", vec3(0, 10, 0), vec3(1, 0, 0), 1);
      b.applyForce(0, -9.81, 0);
      physics.step(1 / 60, [b]);
      return { px: b.position.x, py: b.position.y, vx: b.velocity.x, vy: b.velocity.y };
    }
    assert.deepEqual(run(), run());
  });
});
