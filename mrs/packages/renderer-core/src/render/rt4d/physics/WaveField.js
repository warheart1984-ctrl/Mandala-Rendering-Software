/**
 * Discrete scalar wave field on a 3D grid — Phase C **skeleton / CPU helper** (Drive-G-1).
 * Not a full 4D wave engine and not a B2/media path.
 *
 * ψ^{t+Δt} = 2ψ^t − ψ^{t−Δt} + c² Δt² ∇²ψ^t
 */
export class WaveField {
  /**
   * @param {object} [config]
   * @param {{ nx?: number, ny?: number, nz?: number }} [config.gridSize]
   * @param {number} [config.c]
   * @param {number} [config.dt]
   * @param {Float32Array|number[]} [config.initialState]
   */
  constructor(config = {}) {
    this.gridSize = {
      nx: config.gridSize?.nx ?? 32,
      ny: config.gridSize?.ny ?? 32,
      nz: config.gridSize?.nz ?? 32,
    };
    this.c = config.c ?? 1.0;
    this.dt = config.dt ?? 0.016;
    const { nx, ny, nz } = this.gridSize;
    const n = nx * ny * nz;
    this.psiPrev = new Float32Array(n);
    this.psiCurr = new Float32Array(n);
    this.psiNext = new Float32Array(n);
    if (config.initialState) {
      const src = config.initialState;
      const len = Math.min(n, src.length);
      for (let i = 0; i < len; i++) this.psiCurr[i] = src[i];
    }
  }

  index(ix, iy, iz) {
    const { nx, ny } = this.gridSize;
    return iz * nx * ny + iy * nx + ix;
  }

  /**
   * @param {number} ix
   * @param {number} iy
   * @param {number} iz
   * @param {number} [amplitude=1]
   */
  impulse(ix, iy, iz, amplitude = 1) {
    const { nx, ny, nz } = this.gridSize;
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    this.psiCurr[this.index(ix, iy, iz)] += amplitude;
  }

  step() {
    const { nx, ny, nz } = this.gridSize;
    const c2dt2 = this.c * this.c * this.dt * this.dt;
    for (let iz = 1; iz < nz - 1; iz++) {
      for (let iy = 1; iy < ny - 1; iy++) {
        for (let ix = 1; ix < nx - 1; ix++) {
          const i = this.index(ix, iy, iz);
          const lap =
            this.psiCurr[this.index(ix + 1, iy, iz)] +
            this.psiCurr[this.index(ix - 1, iy, iz)] +
            this.psiCurr[this.index(ix, iy + 1, iz)] +
            this.psiCurr[this.index(ix, iy - 1, iz)] +
            this.psiCurr[this.index(ix, iy, iz + 1)] +
            this.psiCurr[this.index(ix, iy, iz - 1)] -
            6.0 * this.psiCurr[i];
          this.psiNext[i] =
            2.0 * this.psiCurr[i] - this.psiPrev[i] + c2dt2 * lap;
        }
      }
    }
    const tmp = this.psiPrev;
    this.psiPrev = this.psiCurr;
    this.psiCurr = this.psiNext;
    this.psiNext = tmp;
  }

  sampleNormalized(x, y, z) {
    const { nx, ny, nz } = this.gridSize;
    const ix = Math.max(0, Math.min(nx - 1, Math.floor(x)));
    const iy = Math.max(0, Math.min(ny - 1, Math.floor(y)));
    const iz = Math.max(0, Math.min(nz - 1, Math.floor(z)));
    return this.psiCurr[this.index(ix, iy, iz)];
  }
}
