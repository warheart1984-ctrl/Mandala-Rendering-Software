import { FixedStepClock } from "../src/engine/Clock.js";
import { DefaultEngineHost } from "../src/engine/EngineHost.js";
import { DefaultWorldMesh } from "../src/world/WorldMesh.js";
import { DefaultWorld3D } from "../src/world/World3D.js";
import { DefaultBody } from "../src/world/Body.js";
import { DefaultBodyRegistry } from "../src/world/BodyRegistry.js";
import { DefaultBridgeV1 } from "../src/bridge/BridgeV1.js";
import { SimplePhysicsEngine } from "../src/physics/PhysicsEngine.js";
import { GlyphSubstrate4D } from "../src/substrate/Substrate4D.js";
import { NullHeadlessRenderer } from "../src/renderer/RendererCore.js";
import { InMemoryReplayTimeline } from "../src/replay/ReplayTimeline.js";
import { vec3 } from "../src/world/Vec3.js";

const FRAMES = 60;
const DT = 1 / 60;

const clock = new FixedStepClock(DT);
const mesh = new DefaultWorldMesh(
  new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  new Uint32Array([0, 1, 2]),
);
const world = new DefaultWorld3D(mesh);
const registry = new DefaultBodyRegistry();
const body = new DefaultBody("b1", vec3(0, 1, 0), vec3(0, 0, 0), 1);
world.addBody(body);
registry.register(body);

const replay = new InMemoryReplayTimeline();
const renderer = new NullHeadlessRenderer();
const host = new DefaultEngineHost({
  clock,
  world,
  registry,
  bridge: new DefaultBridgeV1(),
  physics: new SimplePhysicsEngine(),
  substrate: new GlyphSubstrate4D(),
  renderer,
  replay,
});

console.log(
  JSON.stringify({
    event: "engine3d-demo-start",
    frames: FRAMES,
    backend: renderer.backend,
    status: "headless-null",
  }),
);

for (let i = 0; i < FRAMES; i++) {
  host.engineTick();
}

console.log(
  JSON.stringify({
    event: "engine3d-demo-complete",
    ticks: host.getTickIndex(),
    replayLength: replay.length(),
    renderCount: renderer.renderCount,
    finalY: body.position.y,
    clockTime: clock.time,
  }),
);
