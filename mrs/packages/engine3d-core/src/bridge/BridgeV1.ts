import type { EngineInputs } from "./EngineInputs.js";
import type { Vec3 } from "../world/Vec3.js";

export interface BridgeV1 {
  evaluate(inputs: EngineInputs): Map<string, Vec3>;
}

/**
 * Pure v1 bridge: gravity-like default forces. Does not mutate world/bodies.
 * Status: **enforced** (tested).
 */
export class DefaultBridgeV1 implements BridgeV1 {
  constructor(private readonly gravityY = -9.81) {}

  evaluate(inputs: EngineInputs): Map<string, Vec3> {
    const forces = new Map<string, Vec3>();
    for (const body of inputs.bodies) {
      forces.set(body.id, {
        x: 0,
        y: this.gravityY * body.mass,
        z: 0,
      });
    }
    return forces;
  }
}
