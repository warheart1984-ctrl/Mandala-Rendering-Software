import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Engine3DInvariants,
  TickInvariantState,
  createEngine3DInvariants,
  createReplayEvidenceInvariant,
} from "../../src/invariants/Engine3DInvariants.js";
import { InMemoryReplayTimeline } from "../../src/replay/ReplayTimeline.js";
import { DefaultEngineHost } from "../../src/engine/EngineHost.js";
import { FixedStepClock } from "../../src/engine/Clock.js";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";
import { DefaultBody } from "../../src/world/Body.js";
import { DefaultBodyRegistry } from "../../src/world/BodyRegistry.js";
import { DefaultBridgeV1 } from "../../src/bridge/BridgeV1.js";
import { SimplePhysicsEngine } from "../../src/physics/PhysicsEngine.js";
import { GlyphSubstrate4D } from "../../src/substrate/Substrate4D.js";
import { NullHeadlessRenderer } from "../../src/renderer/RendererCore.js";
import { vec3 } from "../../src/world/Vec3.js";

describe("invariants-enforced", () => {
  it("catalog is defined; structural descriptions mention EngineHost sequence", () => {
    assert.ok(Engine3DInvariants.length >= 5);
    for (const inv of Engine3DInvariants) {
      assert.ok(inv.id);
      assert.ok(inv.description);
      inv.check();
    }
    const structural = Engine3DInvariants.filter((i) =>
      i.description.includes("Structurally enforced by EngineHost sequence"),
    );
    assert.ok(structural.length >= 3);
  });

  it("TickInvariantState throws when forces not cleared", () => {
    const s = new TickInvariantState();
    assert.throws(() => s.assertForcesClearedBeforePhysics());
    s.forcesMapEmptyBeforePhysics = true;
    s.assertForcesClearedBeforePhysics();
  });

  it("TickInvariantState throws if render without VisualMod", () => {
    const s = new TickInvariantState();
    s.renderCalled = true;
    assert.throws(() => s.assertVisualModBeforeRender());
    s.visualModProduced = true;
    s.assertVisualModBeforeRender();
  });

  it("replay evidence invariant throws when empty", () => {
    const replay = new InMemoryReplayTimeline();
    const inv = createReplayEvidenceInvariant(replay);
    assert.throws(() => inv.check());
    const mesh = new DefaultWorldMesh(
      new Float32Array([0, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Uint32Array([0]),
    );
    const world = new DefaultWorld3D(mesh);
    const body = new DefaultBody("b1", vec3(0, 1, 0), vec3(), 1);
    world.addBody(body);
    const registry = new DefaultBodyRegistry();
    registry.register(body);
    const host = new DefaultEngineHost({
      clock: new FixedStepClock(1 / 60),
      world,
      registry,
      bridge: new DefaultBridgeV1(),
      physics: new SimplePhysicsEngine(),
      substrate: new GlyphSubstrate4D(),
      renderer: new NullHeadlessRenderer(),
      replay,
      invariants: createEngine3DInvariants(replay),
    });
    host.engineTick();
    inv.check();
    assert.equal(replay.length(), 1);
  });
});
