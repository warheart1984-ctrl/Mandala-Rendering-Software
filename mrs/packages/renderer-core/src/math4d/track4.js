/**
 * Track4 — 4D animation keyframes: pos, rot SO(4), sliceNormal, sliceOffset.
 * Status: **partial** — linear / SO(4) blend; Quat4 double-cover SLERP when qL/qR set.
 */

import { lerp, normalize } from "../math/vec4.js";
import { slerpSO4, IDENTITY4 } from "../math/so4.js";
import { rot4FromAngles } from "./rot4.js";
import { quat4SlerpMat, quat4ToMat4, quatIdentity } from "./quat4.js";
import { evaluateSlice } from "./slice.js";

/**
 * @typedef {{
 *   time: number,
 *   pos?: {x,y,z,w},
 *   rot?: Float64Array|number[]|{xy?:number,xz?:number,xw?:number,yz?:number,yw?:number,zw?:number},
 *   qL?: {w,x,y,z},
 *   qR?: {w,x,y,z},
 *   sliceNormal?: {x,y,z,w},
 *   sliceOffset?: number,
 * }} Track4Keyframe
 */

function resolveRot(rot) {
  if (!rot) return new Float64Array(IDENTITY4);
  if (rot instanceof Float64Array || Array.isArray(rot)) return new Float64Array(rot);
  return rot4FromAngles(rot);
}

function hasQuat4(kf) {
  return kf && (kf.qL != null || kf.qR != null);
}

function blendRot(a, b, u) {
  if (hasQuat4(a) || hasQuat4(b)) {
    const qL0 = a.qL ?? quatIdentity();
    const qR0 = a.qR ?? quatIdentity();
    const qL1 = b.qL ?? a.qL ?? quatIdentity();
    const qR1 = b.qR ?? a.qR ?? quatIdentity();
    return quat4SlerpMat(qL0, qR0, qL1, qR1, u);
  }
  return slerpSO4(resolveRot(a.rot), resolveRot(b.rot), u);
}

function surrounding(keyframes, t) {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1 || t <= keyframes[0].time) {
    return { a: keyframes[0], b: keyframes[0], u: 0 };
  }
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return { a: last, b: last, u: 0 };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time || 1;
      return { a, b, u: (t - a.time) / span };
    }
  }
  return { a: last, b: last, u: 0 };
}

/**
 * Sample Track4 at time t.
 * @param {Track4Keyframe[]} keyframes - unsorted OK
 * @param {number} t
 */
export function sampleTrack4(keyframes, t) {
  const sorted = [...(keyframes ?? [])].sort((x, y) => x.time - y.time);
  const pair = surrounding(sorted, t);
  if (!pair) {
    return {
      pos: { x: 0, y: 0, z: 0, w: 0 },
      rot: new Float64Array(IDENTITY4),
      sliceNormal: { x: 0, y: 0, z: 0, w: 1 },
      sliceOffset: 0,
    };
  }
  const { a, b, u } = pair;
  const posA = a.pos ?? { x: 0, y: 0, z: 0, w: 0 };
  const posB = b.pos ?? posA;
  const nA = a.sliceNormal ?? { x: 0, y: 0, z: 0, w: 1 };
  const nB = b.sliceNormal ?? nA;
  const dA = a.sliceOffset ?? 0;
  const dB = b.sliceOffset ?? dA;
  return {
    pos: lerp(posA, posB, u),
    rot: blendRot(a, b, u),
    sliceNormal: normalize(lerp(nA, nB, u)),
    sliceOffset: dA + (dB - dA) * u,
    u,
  };
}

/** Resolve a keyframe's rotation matrix (Quat4 preferred). */
export function track4RotMatrix(kf) {
  if (hasQuat4(kf)) {
    return quat4ToMat4(kf.qL ?? quatIdentity(), kf.qR ?? quatIdentity());
  }
  return resolveRot(kf?.rot);
}

/**
 * Apply sampled Track4 onto a Camera4D instance.
 * @param {import("../camera/Camera4D.js").Camera4D} camera
 * @param {ReturnType<typeof sampleTrack4>} sample
 */
export function applyTrack4ToCamera(camera, sample) {
  camera.position = { ...sample.pos };
  camera.setOrientationMatrix(sample.rot);
  camera.setHyperplaneNormal(sample.sliceNormal);
  camera.setHyperplaneOffset(sample.sliceOffset);
  return camera;
}

/**
 * Convenience: sample + evaluate slice mode together.
 */
export function sampleTrack4WithSlice(keyframes, t, sliceMode = "static") {
  const sample = sampleTrack4(keyframes, t);
  const slice = evaluateSlice(
    {
      mode: sliceMode,
      normal: sample.sliceNormal,
      offset: sample.sliceOffset,
    },
    t
  );
  return { ...sample, slice };
}
