import type { Clock } from "./Clock.js";
import type { BodyRegistry } from "../world/BodyRegistry.js";
import type { World3D } from "../world/World3D.js";
import type { EngineInputs } from "../bridge/EngineInputs.js";

export class InputGatherer {
  gather(
    clock: Clock,
    registry: BodyRegistry,
    world: World3D,
  ): EngineInputs {
    const time = clock.time;
    const dt = clock.deltaTime();
    const bodies = registry.collectBodies();
    const vertices = world.mesh.vertices;
    return { time, dt, bodies, vertices };
  }
}
