export class KeyframeBaker {
  static bake(track, sampler, duration, fps = 60) {
    const frameCount = Math.floor(duration * fps);
    const dt = 1 / fps;
    track.keyframes = [];
    for (let i = 0; i <= frameCount; i++) {
      const t = i * dt;
      const value = sampler(t);
      track.addKeyframe(t, value, "linear");
    }
    return track;
  }
}
