export class Scrubber {
  static snapToFrame(time, fps = 60) {
    const dt = 1 / fps;
    return Math.round(time / dt) * dt;
  }

  static clamp(time, duration) {
    return Math.max(0, Math.min(time, duration));
  }

  static wrap(time, duration) {
    return ((time % duration) + duration) % duration;
  }

  static frameAt(time, fps) {
    return Math.floor(time * fps);
  }

  static timeAt(frame, fps) {
    return frame / fps;
  }
}
