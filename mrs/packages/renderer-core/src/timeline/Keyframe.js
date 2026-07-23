export class Keyframe {
  constructor(time, value, easing = "linear") {
    this.time = time;
    this.value = value;
    this.easing = easing;
  }
}
