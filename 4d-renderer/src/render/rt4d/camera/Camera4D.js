import { vec4, normalize, length } from "../math/vec4.js";
import { Transform4D } from "../math/transform.js";

export class Camera4D {
  constructor(options = {}) {
    this.position = vec4(options.x ?? 0, options.y ?? 0, options.z ?? -2, options.w ?? 0);
    this.lookAt = vec4(options.lx ?? 0, options.ly ?? 0, options.lz ?? 0, options.lw ?? 0);
    this.up = normalize(options.up ?? vec4(0, 1, 0, 0));
    this.hyperUp = normalize(options.hyperUp ?? vec4(0, 0, 0, 1));

    this.fovX = options.fovX ?? 60;
    this.fovY = options.fovY ?? 45;
    this.fovZ = options.fovZ ?? 45;
    this.fovW = options.fovW ?? 30;

    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;

    this.lensRadius = options.lensRadius ?? 0;
    this.focalDistance = options.focalDistance ?? 1;

    this._buildBasis();
  }

  _buildBasis() {
    const forward = normalize(sub(this.lookAt, this.position));

    const right = normalize(cross4D(forward, this.up, this.hyperUp));
    const up = cross4D(right, forward, this.hyperUp);
    const thru = cross4D(right, up, forward);

    this.basis = { right, up, forward, thru };
  }

  generateRay(x, y, u1, u2, u3) {
    const ndcX = (x + (u1 ?? 0.5)) / this.width;
    const ndcY = 1 - (y + (u2 ?? 0.5)) / this.height;

    const aspectX = Math.tan((this.fovX / 2) * Math.PI / 180);
    const aspectY = Math.tan((this.fovY / 2) * Math.PI / 180);
    const aspectW = Math.tan((this.fovW / 2) * Math.PI / 180);

    const rx = (2 * ndcX - 1) * aspectX;
    const ry = (2 * ndcY - 1) * aspectY;
    // Primary look is always along forward; optional w-slice from u3 / fovW.
    const rw = ((u3 ?? 0.5) * 2 - 1) * aspectW;

    const b = this.basis;
    const dir = normalize(vec4(
      rx * b.right.x + ry * b.up.x + b.forward.x + rw * b.thru.x,
      rx * b.right.y + ry * b.up.y + b.forward.y + rw * b.thru.y,
      rx * b.right.z + ry * b.up.z + b.forward.z + rw * b.thru.z,
      rx * b.right.w + ry * b.up.w + b.forward.w + rw * b.thru.w,
    ));

    if (this.lensRadius > 0) {
      const pLens = this._sampleLens();
      const ft = this.focalDistance;
      const pFocus = vec4(
        this.position.x + dir.x * ft,
        this.position.y + dir.y * ft,
        this.position.z + dir.z * ft,
        this.position.w + dir.w * ft,
      );
      const newOrigin = vec4(
        this.position.x + pLens.x,
        this.position.y + pLens.y,
        this.position.z + pLens.z,
        this.position.w + pLens.w,
      );
      return {
        origin: newOrigin,
        direction: normalize(sub(pFocus, newOrigin)),
        tMin: 0.001,
        tMax: 1e9,
      };
    }

    return {
      origin: vec4(this.position.x, this.position.y, this.position.z, this.position.w),
      direction: dir,
      tMin: 0.001,
      tMax: 1e9,
    };
  }

  _sampleLens() {
    const r1 = 2 * Math.PI * Math.random();
    const r2 = Math.sqrt(Math.random()) * this.lensRadius;
    return vec4(Math.cos(r1) * r2, Math.sin(r1) * r2, 0, 0);
  }

  project4Dto3D(point) {
    const d4 = 4;
    return vec4(
      point.x * d4 / (d4 + point.w),
      point.y * d4 / (d4 + point.w),
      point.z * d4 / (d4 + point.w),
      0,
    );
  }
}

function sub(a, b) { return vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w); }
function cross4D(a, b, c) {
  const x = a.y * (b.z * c.w - b.w * c.z) - a.z * (b.y * c.w - b.w * c.y) + a.w * (b.y * c.z - b.z * c.y);
  const y = a.z * (b.w * c.x - b.x * c.w) - a.w * (b.z * c.x - b.x * c.z) + a.x * (b.z * c.w - b.w * c.z);
  const z = a.w * (b.x * c.y - b.y * c.x) - a.x * (b.w * c.y - b.y * c.w) + a.y * (b.w * c.x - b.x * c.w);
  const w = a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
  return vec4(x, y, z, w);
}
