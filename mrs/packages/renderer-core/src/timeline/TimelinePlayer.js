export class TimelinePlayer {
  constructor(timeline) {
    this.timeline = timeline;
    this.time = 0;
    this.playing = false;
    this.loop = false;
    this.playbackSpeed = 1.0;
    this.onFrame = null;
    this.onComplete = null;
    this._lastResult = null;
  }

  play() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  stop() {
    this.playing = false;
    this.time = 0;
    this.timeline.evaluate(0);
  }

  seek(t) {
    this.time = Math.max(0, Math.min(t, this.timeline.duration));
    this._lastResult = this.timeline.evaluate(this.time);
    return this._lastResult;
  }

  update(dt) {
    if (!this.playing) return this._lastResult;
    this.time += dt * this.playbackSpeed;
    if (this.time >= this.timeline.duration) {
      if (this.loop) {
        this.time = 0;
      } else {
        this.time = this.timeline.duration;
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
    }
    this._lastResult = this.timeline.evaluate(this.time);
    if (this.onFrame) this.onFrame(this.time, this._lastResult);
    return this._lastResult;
  }

  get progress() {
    return this.timeline.duration > 0 ? this.time / this.timeline.duration : 0;
  }

  get isPlaying() {
    return this.playing;
  }
}
