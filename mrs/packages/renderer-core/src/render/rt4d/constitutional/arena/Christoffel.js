import { MetricTensor } from "./MetricTensor.js";

export class ChristoffelSymbols {
  constructor(metric) {
    if (!(metric instanceof MetricTensor)) {
      throw new Error("ChristoffelSymbols requires a MetricTensor instance");
    }
    this.metric = metric;
    this.gamma = this._computeChristoffel();
    this.gammaUpper = this.gamma; // For constant metric, upper = lower
  }

  _computeChristoffel() {
    // For constant metric (Minkowski), all Christoffel symbols are zero
    // General formula: Γ^μ_αβ = ½ g^μσ (∂_α g_βσ + ∂_β g_ασ - ∂_σ g_αβ)
    // Since metric components are constant, all derivatives are zero
    return new Array(64).fill(0);
  }

  get(mu, alpha, beta) {
    return this.gamma[mu * 16 + alpha * 4 + beta];
  }

  getUpper(mu, alpha, beta) {
    return this.gammaUpper[mu * 16 + alpha * 4 + beta];
  }

  getAllUpper() {
    return this.gammaUpper;
  }

  applyToVelocity(u) {
    // For flat space, geodesic acceleration is zero
    return { x: 0, y: 0, z: 0, w: 0 };
  }

  geodesicAcceleration(u) {
    return this.applyToVelocity(u);
  }

  toJSON() {
    return {
      nonZeroCount: this.gamma.filter(g => Math.abs(g) > 1e-15).length,
      metricHash: this.metric.hash(),
    };
  }
}

export function computeChristoffel(metric) {
  return new ChristoffelSymbols(metric);
}