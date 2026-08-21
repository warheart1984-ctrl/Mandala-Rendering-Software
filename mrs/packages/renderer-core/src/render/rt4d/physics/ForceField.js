/**
 * Force field + Euler integrate — Phase C implementation (Drive-G-1).
 *
 * Extended with RHFD ∇V driver force types:
 *   - uniform: constant vector field
 *   - attractor: point attractor/repulsor
 *   - vortex: rotational force around axis
 *   - curl_noise: divergence-free turbulence
 *   - twist_gradient: Möbius Flower ∇V (torus curvature)
 *   - drag: velocity damping
 *
 * Optional WaveField coupling via gamma * ψ * waveDir.
 * Optional noise field coupling via η(t) modulation.
 */
export class ForceField {
  /**
   * @param {object} [config]
   * @param {{x:number,y:number,z:number}} [config.g]
   * @param {import("./WaveField.js").WaveField|null} [config.waveField]
   * @param {number} [config.gamma]
   * @param {{x:number,y:number,z:number}} [config.waveDir]
   * @param {ForceFieldLayer[]} [config.layers]
   */
  constructor(config = {}) {
    this.g = config.g ?? { x: 0, y: -9.81, z: 0 };
    this.waveField = config.waveField ?? null;
    this.gamma = config.gamma ?? 0.0;
    this.waveDir = config.waveDir ?? { x: 0, y: 1, z: 0 };
    /** @type {ForceFieldLayer[]} Stacked force layers (additive composition). */
    this.layers = config.layers ?? [];
  }

  force(position, _velocity, mass) {
    const m = mass || 1.0;
    const base = {
      fx: m * this.g.x,
      fy: m * this.g.y,
      fz: m * this.g.z,
    };
    if (!this.waveField) return base;
    const psi = this.waveField.sampleNormalized(
      position.x,
      position.y,
      position.z
    );
    return {
      fx: base.fx + this.gamma * psi * this.waveDir.x,
      fy: base.fy + this.gamma * psi * this.waveDir.y,
      fz: base.fz + this.gamma * psi * this.waveDir.z,
    };
  }

  apply(position, velocity, mass = 1) {
    return this.force(position, velocity, mass);
  }

  integrate(state, dt) {
    const mass = state.mass || 1.0;
    const F = this.force(
      { x: state.x, y: state.y, z: state.z },
      { x: state.vx, y: state.vy, z: state.vz },
      mass
    );
    const ax = F.fx / mass;
    const ay = F.fy / mass;
    const az = F.fz / mass;
    const nvx = state.vx + ax * dt;
    const nvy = state.vy + ay * dt;
    const nvz = state.vz + az * dt;
    return {
      x: state.x + nvx * dt,
      y: state.y + nvy * dt,
      z: state.z + nvz * dt,
      vx: nvx,
      vy: nvy,
      vz: nvz,
      mass,
    };
  }
}

// ── Force Field Layer Types ──────────────────────────────────────

/**
 * @typedef {Object} ForceFieldLayer
 * @property {"uniform"|"attractor"|"vortex"|"curl_noise"|"twist_gradient"|"drag"} type
 * @property {number} [magnitude] - Force strength (default 1.0)
 * @property {number[]} [direction] - [x,y,z] force direction (uniform)
 * @property {number[]} [position] - [x,y,z] attractor/vortex center
 * @property {number} [strength] - Attractor: positive=attract, negative=repel
 * @property {number} [radius] - Influence radius
 * @property {number[]} [axis] - [x,y,z] vortex rotation axis (normalized)
 * @property {number} [angularVelocity] - Rotation speed
 * @property {number} [curlScale] - Curl noise scale
 * @property {number} [damping] - Drag damping [0,1]
 * @property {number} [timeScale] - Noise temporal evolution rate
 */

/**
 * Compute force from a single force field layer.
 * @param {ForceFieldLayer} layer
 * @param {{x:number,y:number,z:number}} position
 * @param {{x:number,y:number,z:number}} velocity
 * @param {number} time - Current time in seconds (for time-dependent layers)
 * @returns {{fx:number,fy:number,fz:number}}
 */
export function computeLayerForce(layer, position, velocity, time = 0) {
  const mag = layer.magnitude ?? 1.0;

  switch (layer.type) {
    case "uniform": {
      const d = layer.direction ?? [0, -9.81, 0];
      return { fx: d[0] * mag, fy: d[1] * mag, fz: d[2] * mag };
    }

    case "attractor": {
      const p = layer.position ?? [0, 0, 0];
      const strength = layer.strength ?? 1.0;
      const radius = layer.radius ?? 10.0;
      const dx = p[0] - position.x;
      const dy = p[1] - position.y;
      const dz = p[2] - position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);
      if (dist < 0.001) return { fx: 0, fy: 0, fz: 0 };
      // Inverse-square with softening at radius
      const falloff = 1.0 / (1.0 + distSq / (radius * radius));
      const f = (strength * mag * falloff) / dist;
      return { fx: dx * f, fy: dy * f, fz: dz * f };
    }

    case "vortex": {
      const center = layer.position ?? [0, 0, 0];
      const axis = layer.axis ?? [0, 1, 0];
      const omega = layer.angularVelocity ?? 1.0;
      const dx = position.x - center[0];
      const dy = position.y - center[1];
      const dz = position.z - center[2];
      // Tangential force: ω × r
      const fx = mag * omega * (axis[1] * dz - axis[2] * dy);
      const fy = mag * omega * (axis[2] * dx - axis[0] * dz);
      const fz = mag * omega * (axis[0] * dy - axis[1] * dx);
      return { fx, fy, fz };
    }

    case "curl_noise": {
      // Divergence-free turbulence from gradient of a scalar field
      const scale = layer.curlScale ?? 0.1;
      const ts = layer.timeScale ?? 0.0;
      const t = time * ts;
      // Pseudo-noise: product of sinusoids (no Math.random — P4 deterministic)
      const nx = Math.sin(position.x * 3.0 + t) * Math.cos(position.y * 3.0 + t * 0.7);
      const ny = Math.cos(position.y * 3.0 + t * 1.3) * Math.sin(position.z * 3.0 + t);
      const nz = Math.sin(position.z * 3.0 + t * 0.5) * Math.cos(position.x * 3.0 + t * 1.1);
      // Curl: ∇ × F → divergence-free
      return {
        fx: mag * scale * (ny - nz),
        fy: mag * scale * (nz - nx),
        fz: mag * scale * (nx - ny),
      };
    }

    case "twist_gradient": {
      // Möbius Flower ∇V: torus curvature from discrete parity gradient
      const R = layer.radius ?? 1.5;
      const ts = layer.timeScale ?? 0.0;
      const t = time * ts;

      // Hex axial coordinates from position
      const q = Math.round(position.x / (R * 0.6) - position.y / (R * 1.0392));
      const r = Math.round(position.y / (R * 0.5196));

      // Discrete parity gradient
      const p00 = (q + r) & 1;
      const p10 = ((q + 1) + r) & 1;
      const p01 = (q + (r + 1)) & 1;
      const gx = p10 - p00;
      const gy = p01 - p00;
      const gz = (gx + gy) * 0.5;
      const gw = (gx - gy) * 0.5;

      // Rotate over time (torus curvature evolution)
      const cosA = Math.cos(t * 0.5);
      const sinA = Math.sin(t * 0.5);
      const rx = gx * cosA - gy * sinA;
      const ry = gx * sinA + gy * cosA;
      const rz = gz * cosA - gw * sinA;
      const rw = gz * sinA + gw * cosA;

      // Project 4D twist back to 3D force
      return {
        fx: mag * rx,
        fy: mag * ry,
        fz: mag * rz,
      };
    }

    case "drag": {
      const damping = layer.damping ?? 0.1;
      return {
        fx: -damping * velocity.x * mag,
        fy: -damping * velocity.y * mag,
        fz: -damping * velocity.z * mag,
      };
    }

    default:
      return { fx: 0, fy: 0, fz: 0 };
  }
}

/**
 * Compute total force from all stacked layers.
 * @param {ForceFieldLayer[]} layers
 * @param {{x:number,y:number,z:number}} position
 * @param {{x:number,y:number,z:number}} velocity
 * @param {number} time
 * @returns {{fx:number,fy:number,fz:number}}
 */
export function computeTotalForce(layers, position, velocity, time = 0) {
  let fx = 0, fy = 0, fz = 0;
  for (const layer of layers) {
    const f = computeLayerForce(layer, position, velocity, time);
    fx += f.fx;
    fy += f.fy;
    fz += f.fz;
  }
  return { fx, fy, fz };
}
