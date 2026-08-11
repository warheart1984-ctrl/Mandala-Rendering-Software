export class Camera3D {
  /**
   * @param {object} opts
   * @param {{x:number,y:number,z:number}} opts.eye
   * @param {{x:number,y:number,z:number}} opts.target
   * @param {number} opts.focal
   */
  constructor({ eye, target, focal }) {
    this.eye = eye;
    this.target = target;
    this.focal = focal;
    this._view = null;
  }

  view() {
    if (this._view) return this._view;
    const forward = {
      x: this.target.x - this.eye.x,
      y: this.target.y - this.eye.y,
      z: this.target.z - this.eye.z,
    };
    const fl = Math.hypot(forward.x, forward.y, forward.z) || 1;
    forward.x /= fl; forward.y /= fl; forward.z /= fl;

    const up = { x: 0, y: 1, z: 0 };
    const right = {
      x: up.y * forward.z - up.z * forward.y,
      y: up.z * forward.x - up.x * forward.z,
      z: up.x * forward.y - up.y * forward.x,
    };
    const rl = Math.hypot(right.x, right.y, right.z) || 1;
    right.x /= rl; right.y /= rl; right.z /= rl;

    const trueUp = {
      x: forward.y * right.z - forward.z * right.y,
      y: forward.z * right.x - forward.x * right.z,
      z: forward.x * right.y - forward.y * right.x,
    };

    this._view = { eye: this.eye, forward, right, trueUp };
    return this._view;
  }

  project(p) {
    const v = this.view();
    const dx = p.x - v.eye.x;
    const dy = p.y - v.eye.y;
    const dz = p.z - v.eye.z;
    const depth = -(dx * v.forward.x + dy * v.forward.y + dz * v.forward.z);
    if (depth <= 0.08) return null;
    const X = (dx * v.right.x + dy * v.right.y + dz * v.right.z) * this.focal / depth;
    const Y = (dx * v.trueUp.x + dy * v.trueUp.y + dz * v.trueUp.z) * this.focal / depth;
    return { X, Y, z: depth };
  }

  static cinematic(N, FRAMES = 300, W = 1280, H = 720) {
    const t = N / FRAMES;
    const twoPi = 2 * Math.PI;
    const eye = {
      x: 0.40 * Math.sin(twoPi * 0.11 * t),
      y: 1.30 + 0.06 * Math.sin(twoPi * 0.07 * t),
      z: 2.60,
    };
    const target = {
      x: 1.80 * Math.sin(twoPi * 0.05 * t),
      y: 0.55,
      z: -8.00,
    };
    const focal = 0.9 * H;
    return new Camera3D({ eye, target, focal });
  }
}