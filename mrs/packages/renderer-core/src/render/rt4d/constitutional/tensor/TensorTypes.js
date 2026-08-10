import { Tensor, TensorEngine, TENSOR_RANKS, COORDINATE_DOMAINS } from "./TensorEngine.js";
import { MetricTensor } from "../arena/MetricTensor.js";
import { ChristoffelSymbols } from "../arena/Christoffel.js";
import { vec4, dot } from "../../math/vec4.js";

export class ScalarField extends Tensor {
  constructor(value, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    super(TENSOR_RANKS.SCALAR, [value], metric, domain);
  }

  get value() {
    return this.components[0];
  }

  set value(v) {
    this.components[0] = v;
  }

  static fromTensor(tensor) {
    if (tensor.rank !== 0) throw new Error("Not a scalar");
    return new ScalarField(tensor.components[0], tensor.metric, tensor.domain);
  }
}

export class FourVector extends Tensor {
  constructor(x, y, z, w, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    super(TENSOR_RANKS.VECTOR, [x, y, z, w], metric, domain);
  }

  get x() { return this.components[0]; }
  get y() { return this.components[1]; }
  get z() { return this.components[2]; }
  get w() { return this.components[3]; }

  get ct() { return this.components[0]; }
  get t() { return this.components[0]; }

  set x(v) { this.components[0] = v; }
  set y(v) { this.components[1] = v; }
  set z(v) { this.components[2] = v; }
  set w(v) { this.components[3] = v; }

  toVec4() {
    return vec4(this.x, this.y, this.z, this.w);
  }

  static fromVec4(v, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new FourVector(v.x, v.y, v.z, v.w, metric, domain);
  }

  static position(ct, x, y, z, metric = null) {
    return new FourVector(ct, x, y, z, metric, COORDINATE_DOMAINS.SPACETIME_4);
  }

  static spatial(x, y, z, w, metric = null) {
    return new FourVector(x, y, z, w, metric, COORDINATE_DOMAINS.SPATIAL_4);
  }
}

export class Rank2Tensor extends Tensor {
  constructor(components, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    super(TENSOR_RANKS.RANK2, components, metric, domain);
  }

  getComponent(mu, nu) {
    return this.components[mu * 4 + nu];
  }

  setComponent(mu, nu, value) {
    this.components[mu * 4 + nu] = value;
  }

  static metricLike(metric) {
    const comps = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      comps[i * 4 + i] = metric.signature[i];
    }
    return new Rank2Tensor(comps, metric);
  }

  static zero(metric = null) {
    return new Rank2Tensor(new Array(16).fill(0), metric);
  }

  static identity(metric = null) {
    const comps = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) comps[i * 4 + i] = 1;
    return new Rank2Tensor(comps, metric);
  }
}

export class ElectromagneticTensor extends Rank2Tensor {
  constructor(components, metric = null) {
    super(components, metric, COORDINATE_DOMAINS.SPACETIME_4);
    this._validateAntisymmetric();
  }

  _validateAntisymmetric() {
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        if (mu !== nu) {
          const diff = Math.abs(this.getComponent(mu, nu) + this.getComponent(nu, mu));
          if (diff > 1e-12) {
            console.warn(`EM tensor not perfectly antisymmetric at [${mu},${nu}]: diff=${diff}`);
          }
        }
      }
    }
  }

  static fromPotential(A, metric) {
    const comps = new Array(16).fill(0);
    const engine = new TensorEngine(metric, new ChristoffelSymbols(metric));
    const dA = engine.exteriorDerivative(new FourVector(A.x, A.y, A.z, A.w, metric));
    return new ElectromagneticTensor(dA.toArray(), metric);
  }

  getElectricField() {
    return { x: this.getComponent(0, 1), y: this.getComponent(0, 2), z: this.getComponent(0, 3) };
  }

  getMagneticField() {
    return {
      x: this.getComponent(2, 3),
      y: -this.getComponent(1, 3),
      z: this.getComponent(1, 2),
    };
  }

  invariant1() {
    let sum = 0;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        sum += this.getComponent(mu, nu) * this.getComponent(mu, nu);
      }
    }
    return 0.5 * sum;
  }

  invariant2() {
    let sum = 0;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        for (let alpha = 0; alpha < 4; alpha++) {
          for (let beta = 0; beta < 4; beta++) {
            const eps = this._leviCivita(mu, nu, alpha, beta);
            sum += eps * this.getComponent(mu, nu) * this.getComponent(alpha, beta);
          }
        }
      }
    }
    return (1/8) * sum;
  }

  _leviCivita(a, b, c, d) {
    const arr = [a, b, c, d];
    const sorted = [...arr].sort((x, y) => x - y);
    if (sorted[0] === sorted[1] || sorted[1] === sorted[2] || sorted[2] === sorted[3]) return 0;
    let inversions = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        if (arr[i] > arr[j]) inversions++;
      }
    }
    return inversions % 2 === 0 ? 1 : -1;
  }
}

export class StressEnergyTensor extends Rank2Tensor {
  constructor(components, metric = null) {
    super(components, metric, COORDINATE_DOMAINS.SPACETIME_4);
  }

  static perfectFluid(rho, p, u, metric) {
    const comps = new Array(16).fill(0);
    const uArr = [u.x, u.y, u.z, u.w];
    const c = 1;
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        const g = metric.getComponent(mu, nu);
        comps[mu * 4 + nu] = (rho * c * c + p) * uArr[mu] * uArr[nu] + p * g;
      }
    }
    return new StressEnergyTensor(comps, metric);
  }

  energyDensity() {
    return this.getComponent(0, 0);
  }

  pressure() {
    return (this.getComponent(1, 1) + this.getComponent(2, 2) + this.getComponent(3, 3)) / 3;
  }

  momentumFlux() {
    return {
      x: this.getComponent(0, 1),
      y: this.getComponent(0, 2),
      z: this.getComponent(0, 3),
    };
  }

  divergence(engine) {
    return engine.divergence(this);
  }
}

export class RiemannTensor extends Tensor {
  constructor(components, metric = null) {
    super(TENSOR_RANKS.RANK4, components, metric, COORDINATE_DOMAINS.SPACETIME_4);
  }

  getComponent(sigma, mu, nu, rho) {
    return this.components[sigma * 64 + mu * 16 + nu * 4 + rho];
  }
}

export class ConstitutionalInteractionTensor extends Tensor {
  constructor(components, metric = null) {
    super(TENSOR_RANKS.RANK4, components, metric, COORDINATE_DOMAINS.SPACETIME_4);
  }

  static zero(metric = null) {
    return new ConstitutionalInteractionTensor(new Array(256).fill(0), metric);
  }
}

export class TensorFactory {
  static createScalar(value, metric = null) {
    return new ScalarField(value, metric);
  }

  static createVector(x, y, z, w, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new FourVector(x, y, z, w, metric, domain);
  }

  static createPosition(ct, x, y, z, metric = null) {
    return FourVector.position(ct, x, y, z, metric);
  }

  static createSpatial(x, y, z, w, metric = null) {
    return FourVector.spatial(x, y, z, w, metric);
  }

  static createEMTensor(A, metric) {
    return ElectromagneticTensor.fromPotential(A, metric);
  }

  static createStressEnergy(rho, p, u, metric) {
    return StressEnergyTensor.perfectFluid(rho, p, u, metric);
  }

  static createZeroRank2(metric = null) {
    return Rank2Tensor.zero(metric);
  }

  static createIdentityRank2(metric = null) {
    return Rank2Tensor.identity(metric);
  }
}

export function createTensorFactory(metric) {
  return {
    scalar: (v) => TensorFactory.createScalar(v, metric),
    vector: (x, y, z, w, domain) => TensorFactory.createVector(x, y, z, w, metric, domain),
    position: (ct, x, y, z) => TensorFactory.createPosition(ct, x, y, z, metric),
    spatial: (x, y, z, w) => TensorFactory.createSpatial(x, y, z, w, metric),
    emTensor: (A) => TensorFactory.createEMTensor(A, metric),
    stressEnergy: (rho, p, u) => TensorFactory.createStressEnergy(rho, p, u, metric),
    zeroRank2: () => TensorFactory.createZeroRank2(metric),
    identityRank2: () => TensorFactory.createIdentityRank2(metric),
  };
}