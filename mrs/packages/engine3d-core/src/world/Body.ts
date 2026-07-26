import type { Vec3 } from "./Vec3.js";
import { vec3 } from "./Vec3.js";

export interface Body {
  readonly id: string;
  position: Vec3;
  velocity: Vec3;
  mass: number;
  applyForce(x: number, y: number, z: number): void;
}

/**
 * Default body with force accumulation for semi-implicit Euler.
 * applyForce deposits into forceAccum; PhysicsEngine consumes and clears it.
 */
export class DefaultBody implements Body {
  readonly forceAccum: Vec3 = vec3();

  constructor(
    public readonly id: string,
    public position: Vec3,
    public velocity: Vec3,
    public mass: number,
  ) {
    if (!(mass > 0) || !Number.isFinite(mass)) {
      throw new Error(`DefaultBody mass must be finite and > 0 (got ${mass})`);
    }
  }

  applyForce(x: number, y: number, z: number): void {
    this.forceAccum.x += x;
    this.forceAccum.y += y;
    this.forceAccum.z += z;
  }

  clearForceAccum(): void {
    this.forceAccum.x = 0;
    this.forceAccum.y = 0;
    this.forceAccum.z = 0;
  }
}

export function isForceAccumBody(
  body: Body,
): body is Body & { forceAccum: Vec3; clearForceAccum(): void } {
  return (
    "forceAccum" in body &&
    typeof (body as { clearForceAccum?: unknown }).clearForceAccum === "function"
  );
}
