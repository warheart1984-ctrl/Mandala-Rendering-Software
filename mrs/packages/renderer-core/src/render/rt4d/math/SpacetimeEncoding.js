/**
 * 4D → 3D Spacetime Encoding using Minkowski Metric
 * 
 * Implements boundary map encoding: ds² = -c²dt² + dx² + dy² + dz²
 * 
 * This encodes 4D spacetime coordinates to 3D visual space using
 * relativistic interval preservation and causal boundary mapping.
 * 
 * Status: partial — mathematical foundation implemented
 */

import { MetricTensor, createMinkowskiMetric } from './MetricTensor.js';
import { project4Dto3D } from './project.js';

/**
 * Spacetime interval encoding for 4D → 3D boundary mapping
 */
export class SpacetimeEncoder {
  constructor(options = {}) {
    this.c = options.c ?? 1.0; // Speed of light (set to 1.0 for natural units)
    this.metric = options.metric ?? createMinkowskiMetric();
    this.d4 = options.d4 ?? 4.0;
    this.boundaryThreshold = options.boundaryThreshold ?? 1e-6;
  }

  /**
   * Compute Minkowski interval ds² = -c²dt² + dx² + dy² + dz²
   * @param {Object} dx - 4D displacement {x, y, z, w} where w is time
   * @returns {number} Spacetime interval
   */
  computeInterval(dx) {
    const dt = dx.w || 0;
    const ds2 = -this.c * this.c * dt * dt + 
                dx.x * dx.x + 
                dx.y * dx.y + 
                dx.z * dx.z;
    return ds2;
  }

  /**
   * Check if displacement is timelike, spacelike, or null
   * @param {Object} dx - 4D displacement
   * @returns {Object} {type, interval}
   */
  classifyInterval(dx) {
    const ds2 = this.computeInterval(dx);
    const type = ds2 < -this.boundaryThreshold ? 'timelike' :
                 ds2 > this.boundaryThreshold ? 'spacelike' :
                 'null';
    return { type, interval: ds2 };
  }

  /**
   * Boundary map encoding: map 4D point to 3D using causal boundary
   * 
   * The boundary is defined by ds² = 0 (light cone)
   * Points inside light cone (timelike) map differently than outside
   * 
   * Uses projective mapping with interval-based scaling
   */
  encode4DTo3D(point4D, options = {}) {
    const { projectionPlane = 'w=0', preserveInterval = true } = options;
    
    // Compute interval from origin
    const interval = this.computeInterval(point4D);
    const classification = this.classifyInterval(point4D);
    
    // Standard perspective projection
    let projected = project4Dto3D(point4D, this.d4);
    
    if (preserveInterval) {
      // Scale by interval to preserve causal structure
      const intervalScale = Math.sqrt(Math.abs(interval) + 1e-12);
      const normalizationFactor = intervalScale > 0 ? 1.0 / intervalScale : 1.0;
      
      projected.x *= normalizationFactor;
      projected.y *= normalizationFactor;
      projected.z *= normalizationFactor;
    }
    
    // Boundary map: light cone boundary defines visible region
    const isVisible = classification.type !== 'null' || 
                      Math.abs(interval) > this.boundaryThreshold;
    
    return {
      point3D: projected,
      interval,
      classification: classification.type,
      isVisible,
      boundaryDistance: Math.abs(interval),
      wCoordinate: point4D.w
    };
  }

  /**
   * Encode boundary map: create 3D shell from 4D manifold
   * 
   * Maps 4D points to 3D surface where ds² = constant
   * This creates the boundary representation of 4D spacetime
   */
  encodeBoundaryMap(points4D, constantInterval = 1.0) {
    return points4D.map(point => {
      const interval = this.computeInterval(point);
      const distance = Math.abs(interval - constantInterval);
      
      // Map to 3D with interval-based weighting
      const encoded = this.encode4DTo3D(point, { preserveInterval: true });
      
      return {
        ...encoded,
        boundaryDistance: distance,
        encodedPoint: encoded.point3D,
        originalPoint: point
      };
    });
  }

  /**
   * Relativistic projection with Lorentz factor
   * 
   * Maps 4D to 3D using time dilation effects
   */
  relativisticProjection(point4D, observerVelocity = {x: 0, y: 0, z: 0}) {
    // Boost velocity
    const v = Math.sqrt(
      observerVelocity.x ** 2 +
      observerVelocity.y ** 2 +
      observerVelocity.z ** 2
    );
    
    if (v < this.boundaryThreshold) {
      // Non-relativistic case
      return this.encode4DTo3D(point4D);
    }
    
    const gamma = 1 / Math.sqrt(1 - (v * v) / (this.c * this.c));
    
    // Apply Lorentz transformation
    const projected = project4Dto3D(point4D, this.d4);
    
    return {
      point3D: {
        x: projected.x * gamma,
        y: projected.y * gamma,
        z: projected.z * gamma,
        visible: projected.visible
      },
      gamma,
      velocity: v,
      interval: this.computeInterval(point4D)
    };
  }

  /**
   * Create 4D → 3D encoding parameters for rendering
   */
  createEncodingParams(sceneBounds) {
    const { min, max } = sceneBounds;
    
    // Compute bounding interval
    const center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
      w: (min.w + max.w) / 2
    };
    
    const corners = [
      {x: min.x, y: min.y, z: min.z, w: min.w},
      {x: max.x, y: max.y, z: max.z, w: max.w}
    ];
    
    const intervals = corners.map(c => this.computeInterval(c));
    const maxInterval = Math.max(...intervals.map(Math.abs));
    
    return {
      metric: 'minkowski',
      c: this.c,
      scale: 1 / (maxInterval + 1e-12),
      center,
      d4: this.d4,
      boundaryThreshold: this.boundaryThreshold
    };
  }
}

/**
 * Convenience function for 4D → 3D Minkowski encoding
 */
export function encode4DTo3DMinkowski(point4D, options = {}) {
  const encoder = new SpacetimeEncoder(options);
  return encoder.encode4DTo3D(point4D, options);
}

/**
 * Boundary map encoding for 4D manifold to 3D surface
 */
export function createBoundaryMap(points4D, options = {}) {
  const encoder = new SpacetimeEncoder(options);
  return encoder.encodeBoundaryMap(points4D, options.constantInterval);
}
