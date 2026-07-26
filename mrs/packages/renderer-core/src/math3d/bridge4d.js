import { vec3 } from "./vec3.js";

/** Canonical dimension-constrained embedding: the fourth coordinate is zero. */
export const embed3DIn4D = (value) => ({ x: value.x, y: value.y, z: value.z, w: 0 });
export const project4DTo3D = (value) => vec3(value.x, value.y, value.z);

export function clamp4DTo3D(value) {
  value.w = 0;
  return value;
}

export function clampRigidBodyTo3D(body) {
  clamp4DTo3D(body.position);
  clamp4DTo3D(body.velocity);
  if (body.acceleration) clamp4DTo3D(body.acceleration);
  if (body.forceAccum) clamp4DTo3D(body.forceAccum);
  body.lockedAxes = { ...(body.lockedAxes ?? {}), w: true };
  return body;
}
