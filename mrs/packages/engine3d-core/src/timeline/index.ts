/**
 * Timeline helpers + default orbit demo timeline.
 */

import type { Timeline } from "./types.js";
import { assertValidTimeline } from "./types.js";
import { evaluateTrack } from "./interpolate.js";
import type { KeyframeValue } from "./types.js";

export function evaluateProperty(
  timeline: Timeline,
  trackId: string,
  t: number,
): KeyframeValue | undefined {
  const track = timeline.tracks.find((tr) => tr.id === trackId);
  if (!track) return undefined;
  return evaluateTrack(track.keyframes, t);
}

export function evaluateCameraEye(
  timeline: Timeline,
  t: number,
): readonly [number, number, number] | undefined {
  const v = evaluateProperty(timeline, "camera.eye", t);
  if (Array.isArray(v) && v.length === 3) {
    return [v[0]!, v[1]!, v[2]!];
  }
  // Also accept property path match
  const track = timeline.tracks.find(
    (tr) => tr.target === "camera" && tr.property === "eye",
  );
  if (!track) return undefined;
  const ev = evaluateTrack(track.keyframes, t);
  if (Array.isArray(ev) && ev.length === 3) return [ev[0]!, ev[1]!, ev[2]!];
  return undefined;
}

/** Short deterministic orbit for demos / Genblaze short clips. */
export function defaultOrbitTimeline(opts?: {
  id?: string;
  duration?: number;
  fps?: number;
  radius?: number;
  height?: number;
}): Timeline {
  const duration = opts?.duration ?? 1;
  const fps = opts?.fps ?? 8;
  const r = opts?.radius ?? 3.2;
  const y = opts?.height ?? 0.4;
  const tl: Timeline = {
    id: opts?.id ?? "demo-orbit",
    duration,
    fps,
    tracks: [
      {
        id: "camera.eye",
        target: "camera",
        property: "eye",
        keyframes: [
          { time: 0, value: [0, y, r], interp: "linear" },
          { time: duration / 2, value: [r, y, 0], interp: "linear" },
          { time: duration, value: [0, y, -r], interp: "linear" },
        ],
      },
    ],
  };
  assertValidTimeline(tl);
  return tl;
}

/**
 * Neutral → smile → smile+squint (ENGINE3D_FACE_TIMELINE_SPEC_v1.0).
 */
export function defaultFaceSmileTimeline(opts?: {
  id?: string;
  duration?: number;
  fps?: number;
}): Timeline {
  const duration = opts?.duration ?? 1;
  const fps = opts?.fps ?? 8;
  const tl: Timeline = {
    id: opts?.id ?? "demo-face-smile",
    duration,
    fps,
    tracks: [
      {
        id: "face.Smile",
        target: "face_blendshape",
        property: "Smile",
        keyframes: [
          { time: 0, value: 0, interp: "linear" },
          { time: duration / 2, value: 0.35, interp: "linear" },
          { time: duration, value: 0.7, interp: "linear" },
        ],
      },
      {
        id: "face.Squint",
        target: "face_blendshape",
        property: "Squint",
        keyframes: [
          { time: 0, value: 0, interp: "linear" },
          { time: duration / 2, value: 0, interp: "linear" },
          { time: duration, value: 0.4, interp: "linear" },
        ],
      },
    ],
  };
  assertValidTimeline(tl);
  return tl;
}

export * from "./types.js";
export * from "./interpolate.js";
export { faceTimelineExample } from "./FaceTimelineExample.js";
