import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vec3 } from "../math3d/vec3.js";
import { FIXED_DT } from "../math3d/physics.js";
import { createWaveField3D, idx } from "../bridge/wave-field-3d.js";
import { WaveBridge } from "../bridge/bridge-contract.js";
import {
  EngineHost,
  World3D,
  Substrate4DStub,
  Renderer3DStub,
  applyForcesFromBridgeOutputs,
} from "./index.js";

describe("engine3d World3D + stubs", () => {
  it("assigns stable body ids and stores mesh.vertices", () => {
    const world = new World3D();
    const a = world.addBody({ position: vec3(1, 0, 0), mass: 1 });
    const b = world.addBody({ position: vec3(2, 0, 0), mass: 1 });
    assert.equal(a.id, 0);
    assert.equal(b.id, 1);
    world.setVertices([vec3(0, 0, 0), vec3(1, 0, 0)]);
    assert.equal(world.mesh.vertices.length, 2);
    assert.equal(world.vertices.length, 2); // mirror
  });

  it("Substrate4DStub and Renderer3DStub record last payloads", () => {
    const sub = new Substrate4DStub();
    const ren = new Renderer3DStub();
    const world = new World3D({ vertices: [vec3(0, 0, 0)] });
    const lifted = [{ x: 0, y: 0, z: 0, w: 0.5 }];
    sub.update(lifted);
    ren.render(world, [0.25]);
    assert.equal(sub.lastLifted4D.length, 1);
    assert.equal(ren.lastFrame.vertexCount, 1);
    assert.equal(ren.lastFrame.visualModLength, 1);
  });
});

describe("engine3d EngineHost v1 loop", () => {
  function makeHostWithImpulse() {
    const field = createWaveField3D({
      nx: 7,
      ny: 7,
      nz: 7,
      dx: 1,
      c: 1,
      dt: FIXED_DT,
    });
    // Center impulse — body placed off-peak for nonzero ∇ψ
    field.psi[idx(field, 3, 3, 3)] = 1;
    field.psiPrev[idx(field, 3, 3, 3)] = 1;

    const world = new World3D();
    world.setVertices([
      vec3(3, 3, 3),
      vec3(2, 3, 3),
      vec3(4, 3, 3),
    ]);
    const body = world.addBody({
      position: vec3(2, 3, 3),
      mass: 1,
      velocity: vec3(0, 0, 0),
    });

    const bridge = new WaveBridge(field, 1, 2, 1);
    const host = new EngineHost({
      world,
      field,
      bridge,
      fixedDelta: FIXED_DT,
    });
    return { host, body, world };
  }

  it("runFrames(5) advances clock and updates stubs", () => {
    const { host, world } = makeHostWithImpulse();
    const summary = host.runFrames(5);
    assert.equal(summary.bridge, "v1");
    assert.equal(summary.status, "partial");
    assert.equal(host.frameIndex, 5);
    assert.ok(host.clock.time > 0);
    assert.equal(
      host.substrate.lastLifted4D.length,
      world.mesh.vertices.length,
    );
    assert.equal(
      host.lastOutputs.visualMod.length,
      world.mesh.vertices.length,
    );
    assert.equal(host.renderer.renderCount, 5);
    assert.equal(host.substrate.updateCount, 5);
  });

  it("after tick substrate and visualMod match mesh.vertices length", () => {
    const { host, world } = makeHostWithImpulse();
    host.engineTick();
    assert.equal(
      host.substrate.lastLifted4D.length,
      world.mesh.vertices.length,
    );
    assert.equal(
      host.lastOutputs.visualMod.length,
      world.mesh.vertices.length,
    );
  });

  it("locked gather uses clock.time and world.mesh.vertices", () => {
    const { host, world } = makeHostWithImpulse();
    const dt = host.clock.deltaTime();
    assert.equal(typeof host.clock.time, "number");
    assert.ok(dt > 0);
    assert.equal(world.mesh.vertices.length, 3);
    host.engineTick(dt);
    assert.equal(host.lastForcesApplied, 1);
  });

  it("center impulse moves body velocity across frames", () => {
    const { host, body } = makeHostWithImpulse();
    const v0 = { ...body.velocity };
    host.runFrames(5);
    const moved =
      Math.abs(body.velocity.x - v0.x) +
        Math.abs(body.velocity.y - v0.y) +
        Math.abs(body.velocity.z - v0.z) >
      1e-9;
    assert.ok(moved, "body velocity should change under wave force");
    assert.ok(host.lastForcesApplied >= 1);
  });

  it("applyForcesFromBridgeOutputs uses stable body ids → body refs", () => {
    const world = new World3D();
    const body = world.addBody({ position: vec3(0, 0, 0), mass: 1 });
    const forces = new Map([[body.id, { x: 3, y: 0, z: 0 }]]);
    const n = applyForcesFromBridgeOutputs(world, forces);
    assert.equal(n, 1);
    assert.equal(body.forceAccum.x, 3);
  });
});
