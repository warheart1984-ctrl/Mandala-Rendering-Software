/**
 * Example face timeline tracks (micro-expressions).
 * Status: **prepared** — uses governed face_blendshape targets.
 */

import type { AnimationTrack, Timeline } from "./types.js";

const smileTrack: AnimationTrack = {
  id: "face_smile",
  target: "face_blendshape",
  property: "Smile",
  keyframes: [
    { time: 0.0, value: 0.0, interp: "linear" },
    { time: 0.5, value: 0.4, interp: "linear" },
    { time: 1.0, value: 0.7, interp: "linear" },
  ],
};

const blinkTrack: AnimationTrack = {
  id: "face_blink_left",
  target: "face_blendshape",
  property: "BlinkLeft",
  keyframes: [
    { time: 0.2, value: 0.0, interp: "linear" },
    { time: 0.25, value: 1.0, interp: "linear" },
    { time: 0.3, value: 0.0, interp: "linear" },
  ],
};

export const faceTimelineExample: Timeline = {
  id: "face_demo",
  duration: 1.5,
  fps: 24,
  tracks: [smileTrack, blinkTrack],
};
