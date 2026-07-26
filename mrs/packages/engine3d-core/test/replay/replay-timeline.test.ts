import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBody } from "../../src/world/Body.js";
import { vec3 } from "../../src/world/Vec3.js";
import {
  freezeReplayRecord,
  InMemoryReplayTimeline,
} from "../../src/replay/ReplayTimeline.js";

describe("replay-timeline", () => {
  it("freezeReplayRecord deep-copies body position/velocity scalars", () => {
    const body = new DefaultBody("b0", vec3(1, 2, 3), vec3(0.1, 0.2, 0.3), 2);
    const frozen = freezeReplayRecord({
      tickIndex: 0,
      time: 0,
      dt: 0.016,
      inputs: {
        time: 0,
        dt: 0.016,
        bodies: [body],
        vertices: new Float32Array([9]),
      },
      visualMod: {
        colors: new Float32Array(),
        scales: new Float32Array(),
        shaderParams: { glyphIntensity: 0.5 },
      },
    });

    const snap = frozen.inputs.bodies[0]!;
    assert.equal(snap.id, "b0");
    assert.equal(snap.mass, 2);
    assert.deepEqual(snap.position, { x: 1, y: 2, z: 3 });
    assert.deepEqual(snap.velocity, { x: 0.1, y: 0.2, z: 0.3 });

    body.position.x = 99;
    body.velocity.y = -7;
    assert.deepEqual(snap.position, { x: 1, y: 2, z: 3 });
    assert.deepEqual(snap.velocity, { x: 0.1, y: 0.2, z: 0.3 });
  });

  it("append stores a snapshot that survives live body mutation", () => {
    const timeline = new InMemoryReplayTimeline();
    const body = new DefaultBody("live", vec3(4, 5, 6), vec3(0, 0, 0), 1);
    timeline.append({
      tickIndex: 0,
      time: 0,
      dt: 0.016,
      inputs: {
        time: 0,
        dt: 0.016,
        bodies: [body],
        vertices: new Float32Array(),
      },
      visualMod: {
        colors: new Float32Array(),
        scales: new Float32Array(),
        shaderParams: {},
      },
    });

    body.position.x = 42;
    body.position.y = 43;
    body.position.z = 44;

    const stored = timeline.get(0)!;
    assert.deepEqual(stored.inputs.bodies[0]!.position, { x: 4, y: 5, z: 6 });
  });
});
