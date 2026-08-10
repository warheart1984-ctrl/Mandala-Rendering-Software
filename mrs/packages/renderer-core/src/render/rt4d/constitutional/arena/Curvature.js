import { ChristoffelSymbols } from "./Christoffel.js";
import { MetricTensor } from "./MetricTensor.js";

export class CurvatureTensors {
  constructor(metric) {
    if (!(metric instanceof MetricTensor)) {
      throw new Error("CurvatureTensors requires a MetricTensor instance");
    }
    this.metric = metric;
    this.christoffel = new ChristoffelSymbols(metric);
    this.riemann = this._computeRiemann();
    this.ricci = this._computeRicci();
    this.einstein = this._computeEinstein();
    this.scalar = this._computeRicciScalar();
  }

  _computeRiemann() {
    const R = new Array(256).fill(0);
    for (let sigma = 0; sigma < 4; sigma++) {
      for (let mu = 0; mu < 4; mu++) {
        for (let nu = 0; nu < 4; nu++) {
          for (let rho = 0; rho < 4; rho++) {
            let val = 0;
            val += this._partialChristoffel(sigma, mu, nu, rho);
            val -= this._partialChristoffel(sigma, mu, rho, nu);
            for (let lambda = 0; lambda < 4; lambda++) {
              val += this.christoffel.get(sigma, lambda, rho) * this.christoffel.get(lambda, mu, nu);
              val -= this.christoffel.get(sigma, lambda, nu) * this.christoffel.get(lambda, mu, rho);
            }
            R[sigma * 64 + mu * 16 + nu * 4 + rho] = val;
          }
        }
      }
    }
    return R;
  }

  _partialChristoffel(sigma, mu, nu, rho) {
    return 0;
  }

  _computeRicci() {
    const Ricci = new Array(16).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        let sum = 0;
        for (let sigma = 0; sigma < 4; sigma++) {
          sum += this.riemann[sigma * 64 + mu * 16 + sigma * 4 + nu];
        }
        Ricci[mu * 4 + nu] = sum;
      }
    }
    return Ricci;
  }

  _computeEinstein() {
    const Einstein = new Array(16).fill(0);
    const R = this._computeRicciScalar();
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        const ricci = this.ricci[mu * 4 + nu];
        const g = this.metric.getComponent(mu, nu);
        Einstein[mu * 4 + nu] = ricci - 0.5 * R * g;
      }
    }
    return Einstein;
  }

  _computeRicciScalar() {
    let R = 0;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        R += this.metric.getInverseComponent(mu, nu) * this.ricci[mu * 4 + nu];
      }
    }
    return R;
  }

  getRiemann(sigma, mu, nu, rho) {
    return this.riemann[sigma * 64 + mu * 16 + nu * 4 + rho];
  }

  getRicci(mu, nu) {
    return this.ricci[mu * 4 + nu];
  }

  getEinstein(mu, nu) {
    return this.einstein[mu * 4 + nu];
  }

  getRicciScalar() {
    return this.scalar;
  }

  einsteinEquation(stressEnergy, G = 1, c = 1) {
    const factor = 8 * Math.PI * G / (c ** 4);
    const violations = [];
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        const lhs = this.getEinstein(mu, nu);
        const rhs = factor * stressEnergy.getComponent(mu, nu);
        const diff = Math.abs(lhs - rhs);
        if (diff > 1e-10) {
          violations.push({ mu, nu, lhs, rhs, diff });
        }
      }
    }
    return {
      satisfied: violations.length === 0,
      violations,
      factor,
    };
  }

  toJSON() {
    return {
      ricciScalar: this.scalar,
      ricciNorm: Math.sqrt(this.ricci.reduce((a, b) => a + b * b, 0)),
      einsteinNorm: Math.sqrt(this.einstein.reduce((a, b) => a + b * b, 0)),
      metricHash: this.metric.hash(),
    };
  }
}

export function computeCurvature(metric) {
  return new CurvatureTensors(metric);
}

export class StressEnergyTensor {
  constructor(components = new Array(16).fill(0)) {
    this.components = components;
  }

  getComponent(mu, nu) {
    return this.components[mu * 4 + nu];
  }

  setComponent(mu, nu, value) {
    this.components[mu * 4 + nu] = value;
  }

  static perfectFluid(rho, p, u, metric) {
    const T = new StressEnergyTensor();
    const uArr = [u.x, u.y, u.z, u.w];
    const c = 1;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        const g = metric.getComponent(mu, nu);
        T.components[mu * 4 + nu] = (rho * c * c + p) * uArr[mu] * uArr[nu] + p * g;
      }
    }
    return T;
  }

  divergence(metric, christoffel) {
    const div = { x: 0, y: 0, z: 0, w: 0 };
    for (let nu = 0; nu < 4; nu++) {
      let sum = 0;
      for (let mu = 0; mu < 4; mu++) {
        const T = this.components[mu * 4 + nu];
        for (let lambda = 0; lambda < 4; lambda++) {
          sum += christoffel.get(lambda, mu, nu) * T;
        }
      }
      div[nu === 0 ? "w" : nu === 1 ? "x" : nu === 2 ? "y" : "z"] = sum;
    }
    return div;
  }

  toJSON() {
    return this.components;
  }
}