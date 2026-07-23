import { Track } from "./Track.js";

export class Timeline {
  constructor(duration = 10, fps = 30) {
    this.duration = duration;
    this.fps = fps;
    this.tracks = [];
    this.loop = false;
  }

  addTrack(track) {
    this.tracks.push(track);
    return this;
  }

  createTrack(id, target, property, interpolator = "linear") {
    const track = new Track(id, target, property, interpolator);
    this.tracks.push(track);
    return track;
  }

  getTrack(id) {
    return this.tracks.find((t) => t.id === id);
  }

  removeTrack(id) {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    return this;
  }

  evaluate(time) {
    const results = {};
    for (const track of this.tracks) {
      const value = track.evaluate(time);
      if (value !== null) {
        track.apply(value);
        results[track.id] = value;
      }
    }
    return results;
  }

  toJSON() {
    return {
      duration: this.duration,
      fps: this.fps,
      loop: this.loop,
      tracks: this.tracks.map((t) => ({
        id: t.id,
        property: t.property,
        interpolator: t.interpolator,
        keyframes: t.keyframes.map((k) => ({ time: k.time, value: k.value, easing: k.easing })),
      })),
    };
  }

  static fromJSON(data, targetResolver) {
    const tl = new Timeline(data.duration, data.fps);
    tl.loop = data.loop ?? false;
    for (const t of data.tracks) {
      const target = targetResolver ? targetResolver(t.id) : null;
      const track = tl.createTrack(t.id, target, t.property, t.interpolator);
      for (const k of t.keyframes) {
        track.addKeyframe(k.time, k.value, k.easing);
      }
    }
    return tl;
  }
}
