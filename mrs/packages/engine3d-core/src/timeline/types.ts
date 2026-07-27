/**
 * Timeline + keyframe contracts for Engine3D cinematic layer.
 * Status: **enforced** by unit tests (interpolation math).
 * Spec: docs/4d-engine/engine3d/ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md
 */

export type InterpMode = "step" | "linear" | "cubic" | "spherical";

export type TrackTarget = "camera" | "mesh" | "material" | "custom";

export type KeyframeValue =
  | number
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export interface Keyframe {
  /** Timestamp in seconds. */
  time: number;
  value: KeyframeValue;
  interp: InterpMode;
}

export interface AnimationTrack {
  id: string;
  target: TrackTarget;
  /** Dot path, e.g. "eye", "lookAt", "fovY", "model.translation". */
  property: string;
  keyframes: Keyframe[];
}

export interface Timeline {
  id: string;
  duration: number;
  fps: number;
  tracks: AnimationTrack[];
}

export function assertValidTimeline(tl: Timeline): void {
  if (!(tl.duration > 0)) throw new Error("timeline.duration must be > 0");
  if (!(tl.fps > 0)) throw new Error("timeline.fps must be > 0");
  if (!Array.isArray(tl.tracks) || tl.tracks.length === 0) {
    throw new Error("timeline.tracks must contain ≥ 1 track");
  }
  for (const track of tl.tracks) {
    if (!track.keyframes || track.keyframes.length < 1) {
      throw new Error(`track ${track.id} must have ≥ 1 keyframe`);
    }
    let prev = -Infinity;
    for (const kf of track.keyframes) {
      if (!(kf.time >= 0)) throw new Error(`keyframe time must be ≥ 0 (${track.id})`);
      if (kf.time < prev) throw new Error(`keyframes must be sorted by time (${track.id})`);
      prev = kf.time;
    }
  }
}

export function frameCount(tl: Timeline): number {
  return Math.max(1, Math.round(tl.duration * tl.fps));
}

export function frameTime(frameIndex: number, fps: number): number {
  return frameIndex / fps;
}
