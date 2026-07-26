import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultEngineHost } from "../../src/engine/EngineHost.js";
import type { Clock } from "../../src/engine/Clock.js";
import type { World3D } from "../../src/world/World3D.js";
import type { BodyRegistry } from "../../src/world/BodyRegistry.js";
import type { BridgeV1 } from "../../src/bridge/BridgeV1.js";
import type { PhysicsEngine } from "../../src/physics/PhysicsEngine.js";
import type { Substrate4D } from "../../src/substrate/Substrate4D.js";
import type { RendererCore } from "../../src/renderer/RendererCore.js";
import { InMemoryReplayTimeline } from "../../src/replay/ReplayTimeline.js";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";

describe("host-order", () => {
  it("engineTick executes in correct order, clears forces, propagates dt", () => {
    const calls: string[] = [];
    let seenDt = -1;
    const clock: Clock = {
      get time() {
        calls.push("clock.time");
        return 0;
      },
      deltaTime() {
        calls.push("clock.deltaTime");
        return 0.016;
      },
    };
    const mesh = new DefaultWorldMesh(
      new Float32Array([0, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Uint32Array([0]),
    );
    const world = new DefaultWorld3D(mesh) as World3D;
    const registry: BodyRegistry = {
      resolve: () => undefined,
      forEachBody: () => {},
      collectBodies: () => {
        calls.push("registry.collectBodies");
        return [];
      },
    };
    const forces = new Map<string, { x: number; y: number; z: number }>();
    const bridge: BridgeV1 = {
      evaluate: () => {
        calls.push("bridge.evaluate");
        forces.set("b1", { x: 1, y: 2, z: 3 });
        return forces;
      },
    };
    const physics: PhysicsEngine = {
      step: (dt) => {
        calls.push("physics.step");
        seenDt = dt;
      },
    };
    const substrate: Substrate4D = {
      update: () => {
        calls.push("substrate.update");
        return {
          colors: new Float32Array(),
          scales: new Float32Array(),
          shaderParams: {},
        };
      },
    };
    const renderer: RendererCore = {
      render: () => {
        calls.push("renderer.render");
      },
    };
    const replay = new InMemoryReplayTimeline();
    const host = new DefaultEngineHost({
      clock,
      world,
      registry,
      bridge,
      physics,
      substrate,
      renderer,
      replay,
    });
    host.engineTick();
    assert.deepEqual(calls, [
      "clock.time",
      "clock.deltaTime",
      "registry.collectBodies",
      "bridge.evaluate",
      "physics.step",
      "substrate.update",
      "renderer.render",
    ]);
    assert.equal(forces.size, 0);
    assert.equal(seenDt, 0.016);
    assert.equal(host.lastDt, 0.016);
    assert.equal(replay.length(), 1);
  });
});
