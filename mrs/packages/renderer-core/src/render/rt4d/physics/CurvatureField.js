/**
 * Scalar curvature field — Phase C **skeleton / CPU helper** (Drive-G-1).
 * Optional WaveField coupling via beta. Not a GPU curvature engine.
 */
export class CurvatureField {
  /**
   * @param {object} [config]
   * @param {number} [config.k0]
   * @param {{x:number,y:number,z:number}} [config.center]
   * @param {number} [config.sigma]
   * @param {number} [config.alpha]
   * @param {number} [config.beta]
   * @param {import("./WaveField.js").WaveField|null} [config.waveField]
   */
  constructor(config = {}) {
    this.k0 = config.k0 ?? 0.0;
    this.center = config.center ?? { x: 0, y: 0, z: 0 };
    this.sigma = config.sigma ?? 1.0;
    this.alpha = config.alpha ?? 0.0;
    this.beta = config.beta ?? 0.0;
    this.waveField = config.waveField ?? null;
  }

  baseK(x, y, z) {
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const dz = z - this.center.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    const s = this.sigma || 1.0;
    return this.k0 * Math.exp(-r2 / (s * s));
  }

  k(x, y, z) {
    return this.baseK(x, y, z);
  }

  kWithWave(x, y, z) {
    const base = this.baseK(x, y, z);
    if (!this.waveField) return base;
    const psi = this.waveField.sampleNormalized(x, y, z);
    return base * (1.0 + this.beta * psi);
  }

  bendDirection(pos, dir, fieldDir) {
    const kv = this.kWithWave(pos.x, pos.y, pos.z);
    const nx = dir.x + this.alpha * kv * fieldDir.x;
    const ny = dir.y + this.alpha * kv * fieldDir.y;
    const nz = dir.z + this.alpha * kv * fieldDir.z;
    const len = Math.hypot(nx, ny, nz) || 1.0;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  sample(_position) {
    return { kxx: 0, kyy: 0, kzz: 0 };
  }
}
