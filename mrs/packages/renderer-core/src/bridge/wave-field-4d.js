/**
 * Skeleton WaveField4D for BridgeContract v2/v3.
 * Status: **skeleton** — holder + no-op step only. Not a tested 4D FD solver.
 */

/**
 * @typedef {Object} WaveField4D
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {number} nw
 * @property {number} dx
 * @property {Float64Array} psi
 * @property {Float64Array} psiPrev
 * @property {"skeleton"} status
 */

/**
 * @param {object} [options]
 * @returns {WaveField4D}
 */
export function createWaveField4D(options = {}) {
  const nx = options.nx ?? 4;
  const ny = options.ny ?? 4;
  const nz = options.nz ?? 4;
  const nw = options.nw ?? 4;
  const n = nx * ny * nz * nw;
  return {
    nx,
    ny,
    nz,
    nw,
    dx: options.dx ?? 1,
    psi: new Float64Array(n),
    psiPrev: new Float64Array(n),
    status: "skeleton",
  };
}

/** Skeleton: intentional no-op. */
export function stepWaveField4D(field) {
  return field;
}
