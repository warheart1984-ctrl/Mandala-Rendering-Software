export class Ray4D {
  constructor(origin, direction) {
    this.origin = { ...origin };
    this.direction = this._normalize(direction);
  }

  pointAt(t) {
    return {
      x: this.origin.x + this.direction.x * t,
      y: this.origin.y + this.direction.y * t,
      z: this.origin.z + this.direction.z * t,
      w: this.origin.w + this.direction.w * t,
    };
  }

  _normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
    if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
    return { x: v.x / len, y: v.y / len, z: v.z / len, w: v.w / len };
  }

  static from2DMouse(mouseX, mouseY, width, height, camera4D) {
    const ndcX = (mouseX / width) * 2 - 1;
    const ndcY = 1 - (mouseY / height) * 2;

    const d4 = camera4D.d4 ?? 4;
    const d3 = camera4D.d3 ?? 4;
    const scale = camera4D.scale ?? 80;

    const viewRay = {
      x: ndcX * scale * d4 * d3,
      y: ndcY * scale * d4 * d3,
      z: d3,
    };

    const rot = camera4D.getRotationMatrix?.() ?? null;
    if (rot) {
      const rx = rot[0] * viewRay.x + rot[1] * viewRay.y + rot[2] * viewRay.z;
      const ry = rot[4] * viewRay.x + rot[5] * viewRay.y + rot[6] * viewRay.z;
      const rz = rot[8] * viewRay.x + rot[9] * viewRay.y + rot[10] * viewRay.z;
      viewRay.x = rx; viewRay.y = ry; viewRay.z = rz;
    }

    return new Ray4D(
      { x: 0, y: 0, z: 0, w: 0 },
      { x: viewRay.x, y: viewRay.y, z: viewRay.z, w: 0 }
    );
  }
}
