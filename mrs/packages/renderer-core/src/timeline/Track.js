import { Keyframe } from "./Keyframe.js";
import { Interpolator } from "./Interpolator.js";

export class Track {
  constructor(id, target, property, interpolator = "linear") {
    this.id = id;
    this.target = target;
    this.property = property;
    this.interpolator = interpolator;
    this.keyframes = [];
  }

  addKeyframe(time, value, easing = "linear") {
    this.keyframes.push(new Keyframe(time, value, easing));
    this.keyframes.sort((a, b) => a.time - b.time);
    return this;
  }

  removeKeyframe(time) {
    this.keyframes = this.keyframes.filter((k) => k.time !== time);
    return this;
  }

  getKeyframe(time) {
    return this.keyframes.find((k) => Math.abs(k.time - time) < 0.001);
  }

  evaluate(time) {
    if (this.keyframes.length === 0) return null;
    if (time <= this.keyframes[0].time) return this.keyframes[0].value;
    const last = this.keyframes[this.keyframes.length - 1];
    if (time >= last.time) return last.value;

    let k0, k1;
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) {
        k0 = this.keyframes[i];
        k1 = this.keyframes[i + 1];
        break;
      }
    }
    if (!k0 || !k1) return null;

    const span = k1.time - k0.time || 1;
    const localT = (time - k0.time) / span;
    return Interpolator.dispatch(this.interpolator, k0.value, k1.value, localT, k0.easing);
  }

  apply(value) {
    if (!this.target || !this.property) return;
    const parts = this.property.split(".");
    let obj = this.target;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }
}
