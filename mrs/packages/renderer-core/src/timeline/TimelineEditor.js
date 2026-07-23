import { Timeline } from "./Timeline.js";
export { Timeline };
export { Keyframe } from "./Keyframe.js";
export { Interpolator } from "./Interpolator.js";
export { Track } from "./Track.js";
export { TimelinePlayer } from "./TimelinePlayer.js";
export { TimelineSerializer } from "./TimelineSerializer.js";
export {
  CameraPathGenerator,
  KeyframeBaker,
  AudioKeyframes,
  Rotation4DChoreo,
  Scrubber,
} from "./utils/index.js";

export class TimelineEditor {
  constructor(timeline, options = {}) {
    this.timeline = timeline;
    this.selectedTrack = null;
    this.selectedKeyframe = null;
    this.snapping = options.snapping ?? true;
    this.snapThreshold = options.snapThreshold ?? 0.1;
    this.onSelectionChange = options.onSelectionChange ?? null;
    this.onTimelineChange = options.onTimelineChange ?? null;
  }

  selectTrack(trackName) {
    this.selectedTrack = this.timeline.getTrack(trackName);
    this.selectedKeyframe = null;
    this.notifySelectionChange();
  }

  selectKeyframe(trackName, time) {
    const track = this.timeline.getTrack(trackName);
    if (track) {
      this.selectedTrack = track;
      this.selectedKeyframe = track.getKeyframe(time);
      this.notifySelectionChange();
    }
  }

  deselect() {
    this.selectedTrack = null;
    this.selectedKeyframe = null;
    this.notifySelectionChange();
  }

  addKeyframe(trackName, time, value, easing = "linear") {
    const track = this.timeline.getTrack(trackName);
    if (!track) throw new Error(`Track not found: ${trackName}`);
    const snappedTime = this.snapping ? this.snapTime(time) : time;
    const keyframe = track.addKeyframe(snappedTime, value, easing);
    this.selectedKeyframe = keyframe;
    this.notifyTimelineChange();
    return keyframe;
  }

  updateKeyframe(trackName, time, value, easing) {
    const track = this.timeline.getTrack(trackName);
    if (!track) throw new Error(`Track not found: ${trackName}`);
    const keyframe = track.getKeyframe(time);
    if (!keyframe) throw new Error(`Keyframe not found at time: ${time}`);
    keyframe.value = value;
    if (easing !== undefined) keyframe.easing = easing;
    this.notifyTimelineChange();
  }

  removeKeyframe(trackName, time) {
    const track = this.timeline.getTrack(trackName);
    if (track) {
      track.removeKeyframe(time);
      if (this.selectedKeyframe && this.selectedKeyframe.time === time) {
        this.selectedKeyframe = null;
      }
      this.notifyTimelineChange();
    }
  }

  moveKeyframe(trackName, oldTime, newTime) {
    const track = this.timeline.getTrack(trackName);
    if (!track) return;
    const keyframe = track.getKeyframe(oldTime);
    if (!keyframe) return;
    const snappedTime = this.snapping ? this.snapTime(newTime) : newTime;
    keyframe.time = snappedTime;
    track.keyframes.sort((a, b) => a.time - b.time);
    this.notifyTimelineChange();
  }

  snapTime(time) {
    const snapInterval = 1 / this.timeline.fps;
    const snapped = Math.round(time / snapInterval) * snapInterval;
    return Math.abs(time - snapped) < this.snapThreshold ? snapped : time;
  }

  duplicateKeyframe(trackName, time) {
    const track = this.timeline.getTrack(trackName);
    if (!track) return;
    const keyframe = track.getKeyframe(time);
    if (!keyframe) return;
    const newTime = time + 1 / this.timeline.fps;
    return this.addKeyframe(trackName, newTime, keyframe.value, keyframe.easing);
  }

  notifySelectionChange() {
    if (this.onSelectionChange) this.onSelectionChange({ track: this.selectedTrack, keyframe: this.selectedKeyframe });
  }

  notifyTimelineChange() {
    if (this.onTimelineChange) this.onTimelineChange(this.timeline);
  }
}

export function createTimeline(options = {}) {
  return new Timeline(options);
}

export function createTimelineEditor(timeline, options = {}) {
  return new TimelineEditor(timeline, options);
}

export const timelinePresets = {
  cinematicRotation: (duration = 10) => {
    const timeline = new Timeline(duration);
    const cameraOrbit = timeline.createTrack("cameraOrbit", "camera", "rotationWeights.xw", "linear");
    cameraOrbit.addKeyframe(0, 0.5);
    cameraOrbit.addKeyframe(duration, 2.0, "easeInOut");
    const cameraDistance = timeline.createTrack("cameraDistance", "camera", "d4", "linear");
    cameraDistance.addKeyframe(0, 6.0);
    cameraDistance.addKeyframe(duration * 0.5, 3.0, "easeInOut");
    cameraDistance.addKeyframe(duration, 6.0, "easeInOut");
    const surfaceRotation = timeline.createTrack("surfaceRotation", "camera", "rotationWeights.yz", "linear");
    surfaceRotation.addKeyframe(0, 0.5);
    surfaceRotation.addKeyframe(duration, 3.0, "easeInOut");
    return timeline;
  },

  dramaticZoom: (duration = 5) => {
    const timeline = new Timeline(duration);
    const cameraDistance = timeline.createTrack("cameraDistance", "camera", "d4", "linear");
    cameraDistance.addKeyframe(0, 10.0);
    cameraDistance.addKeyframe(duration * 0.8, 2.0, "easeInCubic");
    cameraDistance.addKeyframe(duration, 2.0, "easeOut");
    return timeline;
  },

  slowExplore: (duration = 15) => {
    const timeline = new Timeline(duration);
    const cameraOrbit = timeline.createTrack("cameraOrbit", "camera", "rotationWeights.xw", "linear");
    cameraOrbit.addKeyframe(0, 0.3);
    cameraOrbit.addKeyframe(duration, 1.5, "linear");
    const cameraPan = timeline.createTrack("cameraPan", "camera", "position.x", "linear");
    cameraPan.addKeyframe(0, -2);
    cameraPan.addKeyframe(duration, 2, "easeInOut");
    return timeline;
  },
};
