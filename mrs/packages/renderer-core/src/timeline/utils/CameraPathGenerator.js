import { Track } from "../Track.js";

export class CameraPathGenerator {
  static catmullRom(points, duration, camera, property = "position") {
    const track = new Track("camera.position", camera, property, "vector");
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * duration;
      track.addKeyframe(t, points[i], "smoothstep");
    }
    return track;
  }

  static bezier(controlPoints, duration, camera, property = "position") {
    const track = new Track("camera.position", camera, property, "vector");
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pos = this.bezierEval(controlPoints, t);
      track.addKeyframe(t * duration, pos, "linear");
    }
    return track;
  }

  static bezierEval(cp, t) {
    const inv = 1 - t;
    return [
      inv * inv * inv * cp[0][0] + 3 * inv * inv * t * cp[1][0] + 3 * inv * t * t * cp[2][0] + t * t * t * cp[3][0],
      inv * inv * inv * cp[0][1] + 3 * inv * inv * t * cp[1][1] + 3 * inv * t * t * cp[2][1] + t * t * t * cp[3][1],
      inv * inv * inv * cp[0][2] + 3 * inv * inv * t * cp[1][2] + 3 * inv * t * t * cp[2][2] + t * t * t * cp[3][2],
    ];
  }

  static orbit(center, radius, height, duration, camera) {
    const track = new Track("camera.orbit", camera, "position", "vector");
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * duration;
      const angle = (i / steps) * Math.PI * 2;
      track.addKeyframe(t, [center[0] + Math.cos(angle) * radius, center[1] + height, center[2] + Math.sin(angle) * radius], "linear");
    }
    return track;
  }

  static dolly(start, end, duration, camera) {
    const track = new Track("camera.dolly", camera, "position", "vector");
    track.addKeyframe(0, start, "easeInOut");
    track.addKeyframe(duration, end, "easeInOut");
    return track;
  }
}
