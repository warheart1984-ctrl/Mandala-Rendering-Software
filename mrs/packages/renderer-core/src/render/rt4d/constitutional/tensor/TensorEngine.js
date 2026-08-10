import { vec4, dot } from "../../math/vec4.js";
import { MetricTensor } from "../arena/MetricTensor.js";
import { ChristoffelSymbols } from "../arena/Christoffel.js";

export const TENSOR_RANKS = Object.freeze({
  SCALAR: 0,
  VECTOR: 1,
  RANK2: 2,
  RANK3: 3,
  RANK4: 4,
});

export const COORDINATE_DOMAINS = Object.freeze({
  SPACETIME_4: "spacetime_4",
  SPATIAL_4: "spatial_4",
});

export class Tensor {
  constructor(rank, components, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    this.rank = rank;
    this.components = components;
    this.metric = metric;
    this.domain = domain;
    this._validateComponents();
  }

  _validateComponents() {
    const expectedSize = Math.pow(4, this.rank);
    if (this.components.length !== expectedSize) {
      throw new Error(`Rank ${this.rank} tensor requires ${expectedSize} components, got ${this.components.length}`);
    }
  }

  getComponent(...indices) {
    let idx = 0;
    let stride = 1;
    for (let i = this.rank - 1; i >= 0; i--) {
      idx += indices[i] * stride;
      stride *= 4;
    }
    return this.components[idx];
  }

  setComponent(value, ...indices) {
    let idx = 0;
    let stride = 1;
    for (let i = this.rank - 1; i >= 0; i--) {
      idx += indices[i] * stride;
      stride *= 4;
    }
    this.components[idx] = value;
  }

  static scalar(value, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Tensor(TENSOR_RANKS.SCALAR, [value], metric, domain);
  }

  static vector(x, y, z, w, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Tensor(TENSOR_RANKS.VECTOR, [x, y, z, w], metric, domain);
  }

  static rank2(components, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Tensor(TENSOR_RANKS.RANK2, components, metric, domain);
  }

  static rank3(components, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Tensor(TENSOR_RANKS.RANK3, components, metric, domain);
  }

  static rank4(components, metric = null, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Tensor(TENSOR_RANKS.RANK4, components, metric, domain);
  }

  toArray() {
    return [...this.components];
  }

  toJSON() {
    return {
      rank: this.rank,
      components: this.components,
      domain: this.domain,
      metricHash: this.metric?.hash() ?? null,
    };
  }
}

export class TensorEngine {
  constructor(metric = null, christoffel = null) {
    this.metric = metric;
    this.christoffel = christoffel;
  }

  setMetric(metric) {
    this.metric = metric;
    return this;
  }

  setChristoffel(christoffel) {
    this.christoffel = christoffel;
    return this;
  }

  raise(tensor, index) {
    if (!this.metric) throw new Error("Metric required for raise operation");
    if (tensor.rank !== 1) throw new Error("Raise currently only implemented for rank-1 tensors");
    return this.metric.raise(
      { x: tensor.components[0], y: tensor.components[1], z: tensor.components[2], w: tensor.components[3] }
    );
  }

  lower(tensor, index) {
    if (!this.metric) throw new Error("Metric required for lower operation");
    if (tensor.rank !== 1) throw new Error("Lower currently only implemented for rank-1 tensors");
    return this.metric.lower(
      { x: tensor.components[0], y: tensor.components[1], z: tensor.components[2], w: tensor.components[3] }
    );
  }

  contract(tensor, index1, index2) {
    if (tensor.rank < 2) throw new Error("Contraction requires rank >= 2");
    if (index1 < 0 || index1 >= tensor.rank || index2 < 0 || index2 >= tensor.rank) {
      throw new Error("Invalid contraction indices");
    }
    if (index1 === index2) throw new Error("Cannot contract same index");

    const newRank = tensor.rank - 2;
    const resultSize = Math.pow(4, newRank);
    const result = new Array(resultSize).fill(0);

    const iterate = (fixedIndices, depth) => {
      if (depth === tensor.rank) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const indices = [...fixedIndices];
          indices.splice(index1, 0, k);
          indices.splice(index2 > index1 ? index2 : index2, 0, k);
          sum += tensor.getComponent(...indices);
        }
        let idx = 0;
        let stride = 1;
        for (let i = newRank - 1; i >= 0; i--) {
          idx += fixedIndices[i] * stride;
          stride *= 4;
        }
        result[idx] = sum;
        return;
      }
      for (let i = 0; i < 4; i++) {
        iterate([...fixedIndices, i], depth + 1);
      }
    };

    iterate([], 0);
    return new Tensor(newRank, result, this.metric);
  }

  covariantDerivative(tensor, derivativeIndex) {
    if (!this.christoffel) throw new Error("Christoffel symbols required for covariant derivative");
    if (tensor.rank !== 1) throw new Error("Covariant derivative currently only for rank-1 tensors");

    const result = new Array(16).fill(0);
    for (let nu = 0; nu < 4; nu++) {
      for (let mu = 0; mu < 4; mu++) {
        let val = 0;
        val += (derivativeIndex === mu ? 1 : 0) * tensor.components[nu];
        for (let alpha = 0; alpha < 4; alpha++) {
          val += this.christoffel.get(nu, mu, alpha) * tensor.components[alpha];
        }
        result[nu * 4 + mu] = val;
      }
    }
    return new Tensor(2, result, this.metric);
  }

  divergence(tensor) {
    if (!this.christoffel) throw new Error("Christoffel symbols required for divergence");
    if (tensor.rank !== 2) throw new Error("Divergence currently only for rank-2 tensors");

    const result = new Array(4).fill(0);
    for (let nu = 0; nu < 4; nu++) {
      let sum = 0;
      for (let mu = 0; mu < 4; mu++) {
        const T = tensor.getComponent(mu, nu);
        for (let lambda = 0; lambda < 4; lambda++) {
          sum += this.christoffel.get(lambda, mu, nu) * T;
        }
      }
      result[nu] = sum;
    }
    return new Tensor(1, result, this.metric);
  }

  exteriorDerivative(tensor) {
    if (tensor.rank !== 1) throw new Error("Exterior derivative currently only for rank-1 tensors");

    const result = new Array(16).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu * 4 + nu] = (mu === nu ? 0 : 1) * (tensor.components[nu] - tensor.components[mu]);
      }
    }
    return new Tensor(2, result, this.metric);
  }

  tensorProduct(tensorA, tensorB) {
    const newRank = tensorA.rank + tensorB.rank;
    const resultSize = Math.pow(4, newRank);
    const result = new Array(resultSize).fill(0);

    const iterateA = (indicesA, depthA) => {
      if (depthA === tensorA.rank) {
        const iterateB = (indicesB, depthB) => {
          if (depthB === tensorB.rank) {
            const valA = tensorA.getComponent(...indicesA);
            const valB = tensorB.getComponent(...indicesB);
            const combined = [...indicesA, ...indicesB];
            let idx = 0;
            let stride = 1;
            for (let i = newRank - 1; i >= 0; i--) {
              idx += combined[i] * stride;
              stride *= 4;
            }
            result[idx] = valA * valB;
            return;
          }
          for (let i = 0; i < 4; i++) {
            iterateB([...indicesB, i], depthB + 1);
          }
        };
        iterateB([], 0);
        return;
      }
      for (let i = 0; i < 4; i++) {
        iterateA([...indicesA, i], depthA + 1);
      }
    };

    iterateA([], 0);
    return new Tensor(newRank, result, this.metric);
  }

  symmetrize(tensor) {
    if (tensor.rank !== 2) throw new Error("Symmetrize currently only for rank-2");
    const result = new Array(16).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu * 4 + nu] = 0.5 * (tensor.getComponent(mu, nu) + tensor.getComponent(nu, mu));
      }
    }
    return new Tensor(2, result, this.metric);
  }

  antisymmetrize(tensor) {
    if (tensor.rank !== 2) throw new Error("Antisymmetrize currently only for rank-2");
    const result = new Array(16).fill(0);
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        result[mu * 4 + nu] = 0.5 * (tensor.getComponent(mu, nu) - tensor.getComponent(nu, mu));
      }
    }
    return new Tensor(2, result, this.metric);
  }

  trace(tensor) {
    if (tensor.rank !== 2) throw new Error("Trace currently only for rank-2");
    let tr = 0;
    for (let i = 0; i < 4; i++) {
      tr += tensor.getComponent(i, i);
    }
    return tr;
  }

  toJSON() {
    return {
      hasMetric: !!this.metric,
      hasChristoffel: !!this.christoffel,
      metricHash: this.metric?.hash() ?? null,
    };
  }
}

export function createTensorEngine(metric, christoffel) {
  return new TensorEngine(metric, christoffel);
}

export function createMinkowskiEngine() {
  const metric = new MetricTensor([-1, 1, 1, 1]);
  const christoffel = new ChristoffelSymbols(metric);
  return new TensorEngine(metric, christoffel);
}