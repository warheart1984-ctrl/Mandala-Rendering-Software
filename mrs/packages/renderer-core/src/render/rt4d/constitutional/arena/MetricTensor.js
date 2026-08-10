import { vec4, dot } from "../../math/vec4.js";

export const METRIC_SIGNATURES = Object.freeze({
  MINKOWSKI: [-1, 1, 1, 1],
  EUCLIDEAN: [1, 1, 1, 1],
  CUSTOM: null,
});

export class MetricTensor {
  constructor(signature = METRIC_SIGNATURES.MINKOWSKI) {
    this.signature = Array.from(signature);
    if (this.signature.length !== 4) {
      throw new Error("Metric signature must have 4 components");
    }
    this.g = this._buildMetric(this.signature);
    this.gInv = this._buildInverse(this.signature);
    this.determinant = this._computeDeterminant();
  }

  _buildMetric(sig) {
    const g = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      g[i * 4 + i] = sig[i];
    }
    return g;
  }

  _buildInverse(sig) {
    const gInv = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      gInv[i * 4 + i] = 1 / sig[i];
    }
    return gInv;
  }

  _computeDeterminant() {
    let det = 1;
    for (const s of this.signature) det *= s;
    return det;
  }

  getComponent(mu, nu) {
    return this.g[mu * 4 + nu];
  }

  getInverseComponent(mu, nu) {
    return this.gInv[mu * 4 + nu];
  }

  interval(dx) {
    let ds2 = 0;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        ds2 += this.g[mu * 4 + nu] * dx[mu] * dx[nu];
      }
    }
    return ds2;
  }

  intervalVec4(dx) {
    return this.interval([dx.x, dx.y, dx.z, dx.w]);
  }

  raise(vector) {
    const v = [vector.x, vector.y, vector.z, vector.w];
    const result = new Array(4).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu] += this.gInv[mu * 4 + nu] * v[nu];
      }
    }
    return vec4(result[0], result[1], result[2], result[3]);
  }

  lower(vector) {
    const v = [vector.x, vector.y, vector.z, vector.w];
    const result = new Array(4).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu] += this.g[mu * 4 + nu] * v[nu];
      }
    }
    return vec4(result[0], result[1], result[2], result[3]);
  }

  raiseArray(arr) {
    const result = new Array(4).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu] += this.gInv[mu * 4 + nu] * arr[nu];
      }
    }
    return result;
  }

  lowerArray(arr) {
    const result = new Array(4).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu] += this.g[mu * 4 + nu] * arr[nu];
      }
    }
    return result;
  }

  innerProduct(u, v) {
    const uLowered = this.lower(u);
    return dot(uLowered, v);
  }

  norm2(vector) {
    return this.innerProduct(vector, vector);
  }

  normalize(vector) {
    const n2 = this.norm2(vector);
    if (n2 === 0) return vec4(0, 0, 0, 0);
    const factor = 1 / Math.sqrt(Math.abs(n2));
    return vec4(
      vector.x * factor,
      vector.y * factor,
      vector.z * factor,
      vector.w * factor
    );
  }

  isTimelike(vector) {
    return this.norm2(vector) < 0;
  }

  isSpacelike(vector) {
    return this.norm2(vector) > 0;
  }

  isNull(vector) {
    return Math.abs(this.norm2(vector)) < 1e-12;
  }

  certifyInterval(dx) {
    const ds2 = this.intervalVec4(dx);
    return {
      interval: ds2,
      certified: true,
      causalType: ds2 < 0 ? "timelike" : ds2 > 0 ? "spacelike" : "null",
      metricHash: this.hash(),
    };
  }

  hash() {
    let h = 0x811c9dc5;
    for (const s of this.signature) {
      const bytes = new Float64Array([s]);
      const view = new Uint8Array(bytes.buffer);
      for (const b of view) {
        h ^= b;
        h = Math.imul(h, 0x01000193);
      }
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  toJSON() {
    return {
      signature: this.signature,
      determinant: this.determinant,
      hash: this.hash(),
    };
  }

  static minkowski() {
    return new MetricTensor(METRIC_SIGNATURES.MINKOWSKI);
  }

  static euclidean() {
    return new MetricTensor(METRIC_SIGNATURES.EUCLIDEAN);
  }
}

export function createMinkowskiMetric() {
  return MetricTensor.minkowski();
}

export function createEuclideanMetric() {
  return MetricTensor.euclidean();
}