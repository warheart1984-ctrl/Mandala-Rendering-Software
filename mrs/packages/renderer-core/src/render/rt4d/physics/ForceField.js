/**
 * Force field + Euler integrate — Phase C **skeleton / CPU helper** (Drive-G-1).
 * Optional WaveField coupling via gamma * ψ * waveDir.
 */
export class ForceField {
  /**
   * @param {object} [config]
   * @param {{x:number,y:number,z:number}} [config.g]
   * @param {import("./WaveField.js").WaveField|null} [config.waveField]
   * @param {number} [config.gamma]
   * @param {{x:number,y:number,z:number}} [config.waveDir]
   */
  constructor(config = {}) {
    this.g = config.g ?? { x: 0, y: -9.81, z: 0 };
    this.waveField = config.waveField ?? null;
    this.gamma = config.gamma ?? 0.0;
    this.waveDir = config.waveDir ?? { x: 0, y: 1, z: 0 };
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
