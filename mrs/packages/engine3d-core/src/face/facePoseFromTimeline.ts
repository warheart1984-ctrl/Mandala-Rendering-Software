/**
 * Sample face_bone / face_blendshape tracks into FacePoseFrame.
 */

import { evaluateTrack } from "../timeline/interpolate.js";
import type { Timeline } from "../timeline/types.js";
import type { FacePoseFrame } from "./FacePoseFrame.js";
import { emptyFacePose } from "./FacePoseFrame.js";

export function facePoseFromTimeline(timeline: Timeline, t: number): FacePoseFrame {
  const pose = emptyFacePose(t);
  for (const track of timeline.tracks) {
    if (track.target === "face_blendshape") {
      const v = evaluateTrack(track.keyframes, t);
      if (typeof v === "number") {
        pose.expressions.push({ name: track.property, weight: v });
      }
      continue;
    }
    if (track.target === "face_bone") {
      const v = evaluateTrack(track.keyframes, t);
      if (Array.isArray(v)) {
        pose.bones[track.property] = [...v];
      }
    }
  }
  return pose;
}
