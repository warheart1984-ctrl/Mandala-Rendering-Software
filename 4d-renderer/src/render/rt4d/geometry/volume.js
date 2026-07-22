import { vec4, dot, length, sub } from "../math/vec4.js";

export class Volume4D {
  constructor(options = {}) {
    this.sigmaT = options.sigmaT ?? ((p) => 1);
    this.sigmaS = options.sigmaS ?? ((p) => 0.5);
    this.sigmaA = options.sigmaA ?? ((p) => 0.5);
    this.phaseFunction = options.phaseFunction ?? ((wi, wo) => 1 / (2 * Math.PI * Math.PI));
    this.emission = options.emission ?? ((p) => vec4(0, 0, 0, 0));
    this.bounds = options.bounds ?? null;
  }

  sigmaA(p) { return typeof this._sigmaA === "function" ? this._sigmaA(p) : 0; }

  sampleDistance(ray, r1) {
    let t = ray.tMin;
    const maxSteps = 256;
    for (let i = 0; i < maxSteps; i++) {
      const p = vec4(
        ray.origin.x + t * ray.direction.x,
        ray.origin.y + t * ray.direction.y,
        ray.origin.z + t * ray.direction.z,
        ray.origin.w + t * ray.direction.w,
      );
      if (this.bounds && !this._insideBounds(p)) {
        t += 0.05;
        if (t > ray.tMax) return null;
        continue;
      }
      const st = this.sigmaT(p);
      if (st <= 0) { t += 0.05; continue; }
      const sampleDist = -Math.log(1 - r1) / (st + 1e-9);
      t += sampleDist;
      if (t > ray.tMax) return null;
      return { t, position: p, sigmaT: st, sigmaS: this.sigmaS(p) };
    }
    return null;
  }

  transmittance(ray, steps = 32) {
    let tau = 0;
    const dt = (ray.tMax - ray.tMin) / steps;
    for (let i = 0; i < steps; i++) {
      const t = ray.tMin + (i + 0.5) * dt;
      const p = vec4(
        ray.origin.x + t * ray.direction.x,
        ray.origin.y + t * ray.direction.y,
        ray.origin.z + t * ray.direction.z,
        ray.origin.w + t * ray.direction.w,
      );
      tau += this.sigmaT(p) * dt;
    }
    return Math.exp(-tau);
  }

  _insideBounds(p) {
    if (!this.bounds) return true;
    const b = this.bounds;
    return p.x >= b.min.x && p.x <= b.max.x &&
           p.y >= b.min.y && p.y <= b.max.y &&
           p.z >= b.min.z && p.z <= b.max.z &&
           p.w >= b.min.w && p.w <= b.max.w;
  }
}

export class ExponentialFog extends Volume4D {
  constructor(options = {}) {
    super(options);
    this.densityScale = options.densityScale ?? 1;
    this.falloff = options.falloff ?? 0.5;
    this._sigmaA = options.sigmaA ?? (() => 0.5);

    const baseSigmaT = options.baseSigmaT ?? 1;
    const falloff = this.falloff;
    const scale = this.densityScale;

    this.sigmaT = (p) => baseSigmaT * Math.exp(-falloff * p.w * p.w) * scale;
    this.sigmaS = (p) => this.sigmaT(p) * 0.8;
    this.phaseFunction = (wi, wo) => {
      const mu = dot(wi, wo);
      const g = options.asymmetry ?? 0;
      const denom = 1 + g * g - 2 * g * mu;
      return (1 - g * g) / (4 * Math.PI * Math.PI * Math.sqrt(denom * denom * denom));
    };
  }
}
