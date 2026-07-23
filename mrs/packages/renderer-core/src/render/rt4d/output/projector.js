import { vec4, dot } from "../math/vec4.js";

export class Projector4D {
  constructor(options = {}) {
    this.d4 = options.d4 ?? 4;
    this.d3 = options.d3 ?? 4;
    this.scale = options.scale ?? 80;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.bgColor = options.bgColor ?? vec4(0.02, 0.03, 0.04, 1);
  }

  project4Dto3D(point) {
    const wProj = this.d4 / (this.d4 + point.w);
    return vec4(point.x * wProj, point.y * wProj, point.z * wProj, 0);
  }

  project3Dto2D(point3d) {
    const perspective = point3d.z === 0 ? 1 : this.d3 / (this.d3 + point3d.z);
    return {
      sx: point3d.x * this.scale * perspective + this.width / 2,
      sy: point3d.y * this.scale * perspective + this.height / 2,
    };
  }

  project4Dto2D(point) {
    const p3d = this.project4Dto3D(point);
    return this.project3Dto2D(p3d);
  }

  rasterize(pixels, width, height) {
    const clamped = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      clamped[idx] = pixels[idx];
      clamped[idx + 1] = pixels[idx + 1];
      clamped[idx + 2] = pixels[idx + 2];
      clamped[idx + 3] = 255;
    }
    return clamped;
  }
}

export class AOVCollector {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffers = {};
  }

  clear() {
    this.buffers = {};
  }

  addAOV(name, data) {
    this.buffers[name] = data;
  }

  getAOV(name) {
    return this.buffers[name];
  }

  listAOVs() {
    return Object.keys(this.buffers);
  }

  toRGBA(name) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const n = this.width * this.height;
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = Math.min(255, Math.max(0, buf[i * 4] * 255));
      out[i * 4 + 1] = Math.min(255, Math.max(0, buf[i * 4 + 1] * 255));
      out[i * 4 + 2] = Math.min(255, Math.max(0, buf[i * 4 + 2] * 255));
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}
