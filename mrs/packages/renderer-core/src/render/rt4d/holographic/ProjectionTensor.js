/**
 * 4D → 3D Projection Tensor Operator
 * 
 * Explicit implementation of holographic projection using:
 * h_μν = g_μν + n_μ n_ν
 * 
 * Projects 4D spacetime vectors to 3D boundary while preserving metric structure
 * 
 * Status: enforced
 */

import { MetricTensor } from '../constitutional/arena/MetricTensor.js';

export class ProjectionTensor {
  constructor(options = {}) {
    this.c = options.c ?? 1.0;
    this.metric = options.metric ?? MetricTensor.minkowski();
    
    // Default static observer normal: n^μ = (1/c, 0, 0, 0)
    this.normal = this.createStaticObserverNormal();
  }

  /**
   * Create static observer normal vector
   * n^μ = (1/c, 0, 0, 0)
   * n_μ = g_μν n^ν = (-c, 0, 0, 0)
   */
  createStaticObserverNormal() {
    return {
      contravariant: [1/this.c, 0, 0, 0],  // n^μ
      covariant: [-this.c, 0, 0, 0]       // n_μ
    };
  }

  /**
   * Create arbitrary observer normal
   * @param {Object} velocity - Observer 3-velocity (v_x, v_y, v_z)
   */
  createObserverNormal(velocity = {x: 0, y: 0, z: 0}) {
    const v = Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2);
    
    if (v >= this.c) {
      throw new Error('Observer velocity cannot exceed c');
    }
    
    const gamma = 1 / Math.sqrt(1 - (v*v)/(this.c*this.c));
    
    // Boosted normal
    const n_contra = [
      gamma / this.c,
      gamma * velocity.x / this.c,
      gamma * velocity.y / this.c,
      gamma * velocity.z / this.c
    ];
    
    // Lower index: n_μ = g_μν n^ν
    const n_cov = [
      -this.c * n_contra[0],
      n_contra[1],
      n_contra[2],
      n_contra[3]
    ];
    
    return {
      contravariant: n_contra,
      covariant: n_cov,
      gamma,
      velocity: v
    };
  }

  /**
   * Compute projection tensor h_μν = g_μν + n_μ n_ν
   * 
   * This tensor projects 4D vectors onto 3D space orthogonal to n_μ
   */
  computeProjectionTensor(normal = this.normal) {
    const h = [];
    
    for (let mu = 0; mu < 4; mu++) {
      h[mu] = [];
      for (let nu = 0; nu < 4; nu++) {
        const g_mu_nu = this.metric.getComponent(mu, nu);
        const n_mu = normal.covariant[mu];
        const n_nu = normal.covariant[nu];
        h[mu][nu] = g_mu_nu + n_mu * n_nu;
      }
    }
    
    return h;
  }

  /**
   * Project 4D vector to 3D boundary
   * 
   * V_proj^μ = h^ν_μ V_ν
   * 
   * @param {Object} vector4D - 4D vector {t, x, y, z} or {w, x, y, z}
   * @param {Object} normal - Observer normal
   * @returns {Object} 3D projected vector
   */
  projectVector(vector4D, normal = this.normal) {
    const [t, x, y, z] = this.normalizeVectorInput(vector4D);
    
    // Lower the vector: V_μ = g_μν V^ν
    const V_covariant = this.metric.lower({
      x: t,
      y: x,
      z: y,
      w: z
    });
    
    // Get projection tensor
    const h = this.computeProjectionTensor(normal);
    
    // Project: V_proj^μ = h^μ_ν V^ν
    // First compute h^μ_ν = g^μα h_αν
    const h_up = this.raiseProjectionTensor(h);
    
    const result = { x: 0, y: 0, z: 0 };
    
    // Project spatial components only
    for (let i = 0; i < 3; i++) {
      const spatialIdx = i + 1; // 1,2,3 for x,y,z
      let sum = 0;
      for (let nu = 0; nu < 4; nu++) {
        sum += h_up[spatialIdx][nu] * [t, x, y, z][nu];
      }
      result[['x','y','z'][i]] = sum;
    }
    
    return {
      projected: result,
      original: { t, x, y, z },
      normal,
      projectionTensor: h
    };
  }

  /**
   * Project 4D field to 3D boundary field
   * 
   * Applies projection to all points in field
   */
  projectField(field4D, normal = this.normal) {
    const projection = field4D.map(point => this.projectVector(point, normal));
    
    // Compute induced 3D metric
    const inducedMetric = this.computeInducedMetric(normal);
    
    return {
      boundaryField: projection.map(p => p.projected),
      inducedMetric,
      normal,
      originalField: field4D
    };
  }

  /**
   * Compute induced 3D metric on spacelike hypersurface
   * 
   * h_ij = g_ij - g_0i g_0j / g_00
   * 
   * For static observer: h_ij = δ_ij
   */
  computeInducedMetric(normal = this.normal) {
    const h = [];
    
    for (let i = 0; i < 3; i++) {
      h[i] = [];
      for (let j = 0; j < 3; j++) {
        const mu = i + 1;
        const nu = j + 1;
        
        // For flat Minkowski with static observer, this is identity
        const g_ij = this.metric.getComponent(mu, nu);
        const g_0i = this.metric.getComponent(0, mu);
        const g_0j = this.metric.getComponent(0, nu);
        const g_00 = this.metric.getComponent(0, 0);
        
        const h_ij = g_ij - (g_0i * g_0j) / g_00;
        h[i][j] = h_ij;
      }
    }
    
    return {
      components: h,
      determinant: this.computeMatrixDeterminant(h),
      isFlat: this.isMatrixIdentity(h)
    };
  }

  /**
   * Raise projection tensor indices
   */
  raiseProjectionTensor(h_down) {
    const h_up = [];
    const g_inv = this.metric.gInv;
    
    for (let mu = 0; mu < 4; mu++) {
      h_up[mu] = [];
      for (let nu = 0; nu < 4; nu++) {
        let sum = 0;
        for (let alpha = 0; alpha < 4; alpha++) {
          sum += g_inv[mu * 4 + alpha] * h_down[alpha][nu];
        }
        h_up[mu][nu] = sum;
      }
    }
    
    return h_up;
  }

  /**
   * Project 4D to 3D with explicit matrix form
   * 
   * For static observer:
   * P = [[0,0,0,0],
   *      [0,1,0,0],
   *      [0,0,1,0],
   *      [0,0,0,1]]
   * 
   * But derived from spacetime structure, not arbitrary
   */
  projectWithMatrix(vector4D) {
    const [t, x, y, z] = this.normalizeVectorInput(vector4D);
    
    // Explicit projection matrix for static observer
    const P = [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
    
    const result = { x: 0, y: 0, z: 0 };
    const input = [t, x, y, z];
    
    for (let i = 1; i < 4; i++) { // Spatial components only
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        sum += P[i][j] * input[j];
      }
      result[['x','y','z'][i-1]] = sum;
    }
    
    return result;
  }

  /**
   * Normalize vector input to [t,x,y,z] array
   */
  normalizeVectorInput(vector) {
    if (Array.isArray(vector)) {
      return vector;
    }
    
    if ('t' in vector && 'x' in vector && 'y' in vector && 'z' in vector) {
      return [vector.t, vector.x, vector.y, vector.z];
    }
    
    if ('w' in vector && 'x' in vector && 'y' in vector && 'z' in vector) {
      // w is time coordinate
      return [vector.w, vector.x, vector.y, vector.z];
    }
    
    throw new Error('Invalid vector format. Expected {t,x,y,z} or {w,x,y,z}');
  }

  /**
   * Compute matrix determinant (3x3)
   */
  computeMatrixDeterminant(matrix) {
    const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
    return a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
  }

  /**
   * Check if matrix is identity
   */
  isMatrixIdentity(matrix) {
    const tol = 1e-10;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const expected = i === j ? 1 : 0;
        if (Math.abs(matrix[i][j] - expected) > tol) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Create projection operator summary
   */
  createOperatorSummary() {
    const normal = this.normal;
    const projectionTensor = this.computeProjectionTensor(normal);
    const inducedMetric = this.computeInducedMetric(normal);
    
    return {
      metric: 'Minkowski',
      signature: this.metric.signature,
      normal: normal,
      projectionTensor,
      inducedMetric,
      operatorForm: 'h_μν = g_μν + n_μ n_ν',
      projectionMap: 'P: R^1,3 → R^3',
      preserves: 'Causal structure via induced metric',
      kills: 'Components along normal n_μ'
    };
  }
}

/**
 * Factory functions
 */
export function createStaticProjectionTensor(c = 1.0) {
  return new ProjectionTensor({ c });
}

export function createMovingProjectionTensor(velocity, c = 1.0) {
  const proj = new ProjectionTensor({ c });
  proj.normal = proj.createObserverNormal(velocity);
  return proj;
}

/**
 * Simple projection using projection tensor
 */
export function project4DTo3D(vector4D, options = {}) {
  const proj = new ProjectionTensor(options);
  return proj.projectVector(vector4D);
}
