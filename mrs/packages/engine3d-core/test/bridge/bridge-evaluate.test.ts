import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBridgeV1 } from "../../src/bridge/BridgeV1.js";
import { DefaultBody } from "../../src/world/Body.js";
import { vec3 } from "../../src/world/Vec3.js";

describe("bridge-evaluate", () => {
  it("returns Map id→Vec3 and does not mutate bodies", () => {
    const body = new DefaultBody("b1", vec3(0, 1, 0), vec3(0, 0, 0), 2);
    const posBefore = { ...body.position };
    const velBefore = { ...body.velocity };
    const bridge = new DefaultBridgeV1();
    const forces = bridge.evaluate({
      time: 0,
      dt: 0.016,
      bodies: [body],
      vertices: new Float32Array(),
    });
    assert.equal(forces.size, 1);
    assert.deepEqual(forces.get("b1"), { x: 0, y: -9.81 * 2, z: 0 });
    assert.deepEqual(body.position, posBefore);
    assert.deepEqual(body.velocity, velBefore);
    assert.equal(body.forceAccum.y, 0);
  });
});
