import type { Body } from "../world/Body.js";
import { isForceAccumBody } from "../world/Body.js";

export interface PhysicsEngine {
  step(dt: number, bodies: Body[]): void;
}

/**
 * Semi-implicit Euler: v += (F/m)*dt; p += v*dt; clear F.
 * Collision: skipped (optional).
 * Status: **enforced** (tested).
 */
export class SimplePhysicsEngine implements PhysicsEngine {
  step(dt: number, bodies: Body[]): void {
    if (!(dt >= 0) || !Number.isFinite(dt)) {
      throw new Error(`PhysicsEngine.step dt must be finite >= 0 (got ${dt})`);
    }
    for (const body of bodies) {
      if (isForceAccumBody(body)) {
        const invMass = 1 / body.mass;
        body.velocity.x += body.forceAccum.x * invMass * dt;
        body.velocity.y += body.forceAccum.y * invMass * dt;
        body.velocity.z += body.forceAccum.z * invMass * dt;
        body.clearForceAccum();
      }
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;
    }
  }
}
