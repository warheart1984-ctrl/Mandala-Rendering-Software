import { PhysicsWorld4D } from "../physics/PhysicsWorld4D.js";
import { RigidBody4D } from "../physics/RigidBody4D.js";
import { vec3 } from "./vec3.js";

export const FIXED_DT = 1 / 60;

export class EngineClock {
  constructor(options = {}) {
    this.fixedDelta = options.fixedDelta ?? FIXED_DT;
    this.maxDelta = options.maxDelta ?? 0.25;
    if (!(this.fixedDelta > 0) || !(this.maxDelta >= 0)) {
      throw new RangeError("EngineClock requires fixedDelta > 0 and maxDelta >= 0");
    }
    this.accumulator = 0;
    this.elapsed = 0;
  }

  advance(deltaSeconds, step) {
    const delta = Math.min(this.maxDelta, Math.max(0, deltaSeconds));
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.fixedDelta) {
      step(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
      this.elapsed += this.fixedDelta;
      steps++;
    }
    return { steps, alpha: this.accumulator / this.fixedDelta, elapsed: this.elapsed };
  }

  reset() {
    this.accumulator = 0;
    this.elapsed = 0;
  }
}

/**
 * Partial 3D facade over RigidBody4D. The hidden fourth components are clamped
 * to zero before and after every mutation/integration.
 */
export class RigidBody3D extends RigidBody4D {
  constructor(options = {}) {
    super({
      ...options,
      position: { ...(options.position ?? vec3()), w: 0 },
      velocity: { ...(options.velocity ?? vec3()), w: 0 },
      lockedAxes: { ...(options.lockedAxes ?? {}), w: true },
    });
    this._clampW();
  }

  _clampW() {
    this.position.w = 0;
    this.velocity.w = 0;
    this.acceleration.w = 0;
    this.forceAccum.w = 0;
  }

  applyForce(x, y, z) {
    super.applyForce(x, y, z, 0);
    this._clampW();
  }

  applyImpulse(x, y, z) {
    super.applyImpulse(x, y, z, 0);
    this._clampW();
  }

  integrate(dt) {
    super.integrate(dt);
    this._clampW();
  }

  setPosition(x, y, z) {
    super.setPosition(x, y, z, 0);
  }

  setVelocity(x, y, z) {
    super.setVelocity(x, y, z, 0);
  }
}

/** Partial 3D facade over PhysicsWorld4D integration; 4D colliders remain opt-in. */
export class PhysicsWorld3D extends PhysicsWorld4D {
  constructor(options = {}) {
    super({ ...options, gravity: { ...(options.gravity ?? vec3()), w: 0 } });
    this.gravity.w = 0;
  }

  createBody(options = {}) {
    const body = new RigidBody3D(options);
    this.bodies.push(body);
    return body;
  }

  step(dt) {
    super.step(dt);
    for (const body of this.bodies) body._clampW?.();
    this.gravity.w = 0;
  }
}

export function stepPhysicsFixed(world, clock, deltaSeconds, fixedDelta = FIXED_DT) {
  if (clock.fixedDelta !== fixedDelta) clock.fixedDelta = fixedDelta;
  return clock.advance(deltaSeconds, (dt) => world.step(dt));
}

export const Body3D = RigidBody3D;
