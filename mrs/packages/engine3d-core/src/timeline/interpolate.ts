/**
 * Deterministic keyframe interpolation (ENGINE3D_KEYFRAME_INTERPOLATION_MATH_v1.0).
 * Status: **enforced** by tests.
 */

import type { InterpMode, Keyframe, KeyframeValue } from "./types.js";

function asNums(v: KeyframeValue): number[] | null {
  return Array.isArray(v) ? [...v] : null;
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function packVec(out: number[]): KeyframeValue {
  if (out.length === 3) return [out[0]!, out[1]!, out[2]!];
  if (out.length === 4) return [out[0]!, out[1]!, out[2]!, out[3]!];
  throw new Error("vector interpolation supports vec3 or quat4 only");
}

function lerpValue(a: KeyframeValue, b: KeyframeValue, t: number): KeyframeValue {
  if (typeof a === "number" && typeof b === "number") {
    return lerpNum(a, b, t);
  }
  const av = asNums(a);
  const bv = asNums(b);
  if (av && bv && av.length === bv.length) {
    return packVec(av.map((ai, i) => lerpNum(ai, bv[i]!, t)));
  }
  throw new Error("linear/cubic interpolation requires matching value shapes");
}

/** Cubic Bezier on the value channel using P0=a, P3=b, P1/P2 as 1/3–2/3 lerp handles. */
function cubicValue(a: KeyframeValue, b: KeyframeValue, t: number): KeyframeValue {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  const p1 = lerpValue(a, b, 1 / 3);
  const p2 = lerpValue(a, b, 2 / 3);
  if (typeof a === "number" && typeof b === "number") {
    return (
      w0 * a +
      w1 * (p1 as number) +
      w2 * (p2 as number) +
      w3 * b
    );
  }
  const av = asNums(a);
  const bv = asNums(b);
  const p1v = asNums(p1);
  const p2v = asNums(p2);
  if (av && bv && p1v && p2v) {
    return packVec(
      av.map((ai, i) => w0 * ai + w1 * p1v[i]! + w2 * p2v[i]! + w3 * bv[i]!),
    );
  }
  throw new Error("cubic interpolation requires matching value shapes");
}

function quatDot(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function quatNorm(
  q: readonly [number, number, number, number],
): [number, number, number, number] {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Spherical linear interpolation for unit quaternions (xyzw). */
export function slerp(
  aIn: readonly [number, number, number, number],
  bIn: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let a = quatNorm(aIn);
  let b = quatNorm(bIn);
  let dot = quatDot(a, b);
  if (dot < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return quatNorm([
      lerpNum(a[0], b[0], t),
      lerpNum(a[1], b[1], t),
      lerpNum(a[2], b[2], t),
      lerpNum(a[3], b[3], t),
    ]);
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinT = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / sinT;
  const w1 = Math.sin(t * theta) / sinT;
  return quatNorm([
    w0 * a[0] + w1 * b[0],
    w0 * a[1] + w1 * b[1],
    w0 * a[2] + w1 * b[2],
    w0 * a[3] + w1 * b[3],
  ]);
}

function findSegment(
  keyframes: readonly Keyframe[],
  t: number,
): { i: number; j: number; alpha: number } {
  if (keyframes.length === 1) return { i: 0, j: 0, alpha: 0 };
  if (t <= keyframes[0]!.time) return { i: 0, j: 0, alpha: 0 };
  const last = keyframes.length - 1;
  if (t >= keyframes[last]!.time) return { i: last, j: last, alpha: 0 };
  for (let i = 0; i < last; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const alpha = span <= 0 ? 0 : (t - a.time) / span;
      return { i, j: i + 1, alpha };
    }
  }
  return { i: last, j: last, alpha: 0 };
}

/**
 * Evaluate a track at time `t` (seconds). Uses the left keyframe's `interp`
 * mode for the segment between k_i and k_{i+1}.
 */
export function evaluateTrack(
  keyframes: readonly Keyframe[],
  t: number,
  defaultInterp: InterpMode = "linear",
): KeyframeValue {
  if (!keyframes.length) throw new Error("track has no keyframes");
  const { i, j, alpha } = findSegment(keyframes, t);
  const ka = keyframes[i]!;
  const kb = keyframes[j]!;
  if (i === j) return ka.value;
  const mode = ka.interp ?? defaultInterp;
  if (mode === "step") return ka.value;
  if (mode === "spherical") {
    const av = asNums(ka.value);
    const bv = asNums(kb.value);
    if (av && bv && av.length === 4 && bv.length === 4) {
      return slerp(
        [av[0]!, av[1]!, av[2]!, av[3]!],
        [bv[0]!, bv[1]!, bv[2]!, bv[3]!],
        alpha,
      );
    }
    throw new Error("spherical interp requires quat4 values");
  }
  if (mode === "cubic") return cubicValue(ka.value, kb.value, alpha);
  return lerpValue(ka.value, kb.value, alpha);
}
