import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { FourVector } from "../constitutional/tensor/index.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, CertifiedProjection } from "../constitutional/projection/index.js";
import { certifyTensor, AUTHORITIES } from "../constitutional/governance/index.js";

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function skyDawnFactor(sunDirY, opts = {}) {
  const { horizon = 0.25, span = 0.85 } = opts;
  const v = (sunDirY + horizon) / span;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function minkowskiRapidity(fourVelocity4, reference4 = [1, 0, 0, 0], metric) {
  const g = metric ?? MetricTensor.minkowski();
  const u = fourVelocity4 instanceof FourVector ? fourVelocity4 : new FourVector(...fourVelocity4, g);
  const r = reference4 instanceof FourVector ? reference4 : new FourVector(...reference4, g);
  const inner = -(u.x * r.x) + u.y * r.y + u.z * r.z + u.w * r.w;
  return Math.acosh(Math.max(1, -inner));
}

export class SkyDome {
  /**
   * @param {object} config
   * @param {number} [config.gridW] = 96
   * @param {number} [config.gridH] = 64
   * @param {number[]} [config.zenith4] = [0, 1, 0, 0]
   * @param {number} [config.seed] = 0x5EED4D00
   */
  constructor(config = {}) {
    this.gridW = config.gridW ?? 96;
    this.gridH = config.gridH ?? 64;
    this.zenith4 = config.zenith4 ?? [0, 1, 0, 0];
    this.seed = config.seed ?? 0x5EED4D00;
    this.zenithCert = null;
  }

  /** Certified once: CertifiedProjector.projectCertified(zenith4, policy, camera4d, opts) */
  certifyZenith(certifiedProjector, policy, camera4d, opts = {}) {
    const metric = policy instanceof ProjectionPolicy ? MetricTensor.minkowski() : new MetricTensor([-1, 1, 1, 1]);
    const zenithVec = this.zenith4 instanceof FourVector ? this.zenith4 : new FourVector(...this.zenith4, metric);
    const cert = certifiedProjector.projectCertified(zenithVec, policy, camera4d, opts);
    // Expose validation at top level for test compatibility
    cert.validation = cert.certifiedTensor?.validation ?? { passed: false };
    this.zenithCert = cert;
    return cert;
  }

  /** Pure per-frame color grid. data is RGBA floats, rows-major. */
  colorGrid({ dawn, sunDir }) {
    const palette = SkyDome.dawnPalette(dawn);
    const data = new Float32Array(this.gridW * this.gridH * 4);
    const rand = mulberry32(this.seed ^ 0xC0FFEE);

    for (let row = 0; row < this.gridH; row++) {
      const v = row / (this.gridH - 1);
      const t = v * v;
      const r = palette.top[0] * (1 - t) + palette.horizon[0] * t;
      const g = palette.top[1] * (1 - t) + palette.horizon[1] * t;
      const b = palette.top[2] * (1 - t) + palette.horizon[2] * t;

      for (let col = 0; col < this.gridW; col++) {
        const idx = (row * this.gridW + col) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 1.0;
      }
    }
    return { data, gridW: this.gridW, gridH: this.gridH };
  }

  static dawnPalette(dawn) {
    return {
      top: [0.05 + 0.02 * dawn, 0.05 + 0.1 * dawn, 0.15 + 0.2 * dawn],
      horizon: [0.5 + 0.3 * dawn, 0.3 + 0.4 * dawn, 0.15 + 0.2 * dawn],
      glow: [1.0, 0.7 + 0.2 * dawn, 0.2 + 0.3 * dawn],
    };
  }
}