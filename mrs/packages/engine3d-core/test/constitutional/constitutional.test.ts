import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DefaultEngineHost,
  type EngineTickPhase,
} from "../../src/engine/EngineHost.js";
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
import { DefaultSubstrate4D } from "../../src/substrate/Substrate4D.js";
import { createDefaultEngine3DRules } from "../../src/governance/rules/defaultRules.js";
import { DefaultCIEMSOverlay } from "../../src/governance/CIEMSOverlay.js";
import type { GovernanceRuleContext } from "../../src/governance/dsl/Rule.js";

function makeHost(phaseTrace: EngineTickPhase[]) {
  const clock: Clock = {
    get time() {
      return 0;
    },
    deltaTime() {
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
    collectBodies: () => [],
  };
  const forces = new Map<string, { x: number; y: number; z: number }>();
  const bridge: BridgeV1 = {
    evaluate: () => {
      forces.set("b1", { x: 1, y: 0, z: 0 });
      return forces;
    },
  };
  const physics: PhysicsEngine = { step: () => {} };
  const substrate: Substrate4D = {
    update: () => ({
      colors: new Float32Array(),
      scales: new Float32Array(),
      shaderParams: {},
    }),
  };
  const renderer: RendererCore = { render: () => {} };
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
    phaseTrace,
  });
  return { host, replay, forces };
}

describe("constitutional", () => {
  it("EngineHost executes in constitutional phase order", () => {
    const phaseTrace: EngineTickPhase[] = [];
    const { host, forces } = makeHost(phaseTrace);
    host.engineTick();
    assert.deepEqual(phaseTrace, [
      "gather",
      "bridge",
      "applyForces",
      "clearForces",
      "physics",
      "substrate",
      "render",
      "replay",
    ]);
    assert.equal(forces.size, 0);
  });

  it("ReplayRecord is immutable after append", () => {
    const phaseTrace: EngineTickPhase[] = [];
    const { host, replay } = makeHost(phaseTrace);
    host.engineTick();
    const record = replay.get(0);
    assert.ok(record);
    assert.throws(() => {
      (record as { time: number }).time = 999;
    }, TypeError);
  });

  it("Substrate update is deterministic", () => {
    const substrate = new DefaultSubstrate4D();
    const lifted = {
      positions4D: new Float32Array([1, 2, 3, 1]),
      velocities4D: new Float32Array([0, 0, 0, 0]),
    };
    const a = substrate.update(lifted);
    const b = substrate.update(lifted);
    assert.deepEqual(Array.from(a.colors), Array.from(b.colors));
    assert.deepEqual(Array.from(a.scales), Array.from(b.scales));
    assert.deepEqual(a.shaderParams, b.shaderParams);
  });

  it("governance overlay + rules fire for matching context", () => {
    const rules = createDefaultEngine3DRules();
    const ctx: GovernanceRuleContext = {
      replay: {
        visualMod: {
          shaderParams: { frameTimeMs: 8, glyphIntensity: 0.2 },
        },
      },
      contract: { maxFrameTimeMs: 4 },
      signals: [],
    };
    rules.evaluate(ctx);
    assert.equal(ctx.signals.length, 1);
    const overlay = new DefaultCIEMSOverlay();
    const mod = overlay.applySignals(ctx.signals, {
      colors: new Float32Array([1, 1, 1, 1]),
      scales: new Float32Array([1]),
      shaderParams: {},
    });
    assert.equal(mod.shaderParams["governanceCriticalCount"], 1);
  });

  it(
    "GPU allocation requires contract — deferred (no scheduler runtime)",
    { skip: "GPU scheduler / GPUContract runtime not implemented (declared)" },
    () => {
      assert.fail("unreachable");
    },
  );

  it(
    "Renderer rejects missing governance signals — deferred",
    {
      skip:
        "NullHeadlessRenderer does not require governance signals (declared cluster rule)",
    },
    () => {
      assert.fail("unreachable");
    },
  );

  it(
    "Mandala lattice requires governance signals — deferred",
    {
      skip:
        "Visualizer service / lattice signal gate not implemented (declared)",
    },
    () => {
      assert.fail("unreachable");
    },
  );
});
