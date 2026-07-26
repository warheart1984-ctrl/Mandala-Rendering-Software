import { scale3 } from "../math3d/vec3.js";
import { waveGradientAtPosition } from "./bridge-map.js";

/**
 * Apply a wave-gradient force contribution to a 3D body.
 *
 * Convention (force-style):
 *   F = −k ∇ψ
 * If `body.applyForce` exists (math3d Body3D / RigidBody3D), the force is
 * accumulated there; Body3D.integrate converts F → a = F/m.
 * If only `acceleration` exists, this sets
 *   a += (−k ∇ψ) / mass
 * so callers without force accumulators still get consistent units.
 *
 * `k` is a stiffness/coupling scalar — it does **not** already include 1/mass.
 *
 * Status: **partial** — discrete sampling + force coupling only.
 *
 * @param {import("./wave-field-3d.js").WaveField3D} field
 * @param {{
 *   position: { x: number, y: number, z: number },
 *   mass?: number,
 *   acceleration?: { x: number, y: number, z: number },
 *   applyForce?: (fx: number, fy: number, fz: number) => void,
 * }} body
 * @param {number} [k=1]
 * @returns {{ x: number, y: number, z: number }} Force contribution F = −k ∇ψ
 */
export function applyWaveForceToBody(field, body, k = 1) {
  const grad = waveGradientAtPosition(field, body.position);
  const force = scale3(grad, -k);

  if (typeof body.applyForce === "function") {
    body.applyForce(force.x, force.y, force.z);
  } else if (body.acceleration) {
    const mass = body.mass > 0 ? body.mass : 1;
    const inv = 1 / mass;
    body.acceleration.x += force.x * inv;
    body.acceleration.y += force.y * inv;
    body.acceleration.z += force.z * inv;
  }

  return force;
}
