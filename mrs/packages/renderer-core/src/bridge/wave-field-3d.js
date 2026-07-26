/**
 * Discrete 3D scalar wave field (finite-difference stepper).
 *
 * Status: **partial** — a tested second-order FD wave solver on a regular grid.
 * This is not a continuum PDE proof, not unconditionally stable, and not wired
 * into the live Genblaze / RT4D path tracer loop.
 *
 * CFL: the explicit scheme is stable only when the Courant number
 *   σ = c * dt / dx
 * stays in a safe range (typically σ ≤ 1/√3 ≈ 0.577 in 3D). Callers must choose
 * `c`, `dt`, and `dx` accordingly; this module does not silently enforce or
 * claim unconditional stability.
 *
 * Boundary: Dirichlet zero — cells on the outer faces are left at 0 and are
 * not updated by the interior stencil.
 */

/**
 * @typedef {Object} WaveField3D
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {number} dx
 * @property {number} c
 * @property {number} dt
 * @property {{ x: number, y: number, z: number }} origin World-space corner of cell (0,0,0).
 * @property {Float64Array} psi Current amplitude buffer.
 * @property {Float64Array} psiPrev Previous amplitude buffer (for second-order time).
 * @property {Float64Array} [_scratch] Optional scratch for ping-pong (allocated lazily).
 */

/**
 * Linear index for a grid cell. Layout: i + nx * (j + ny * k).
 * @param {WaveField3D} field
 * @param {number} i
 * @param {number} j
 * @param {number} k
 */
export function idx(field, i, j, k) {
  return i + field.nx * (j + field.ny * k);
}

/**
 * @param {object} options
 * @param {number} [options.nx=16]
 * @param {number} [options.ny=16]
 * @param {number} [options.nz=16]
 * @param {number} [options.dx=1]
 * @param {number} [options.c=1]
 * @param {number} [options.dt]
 * @param {{ x?: number, y?: number, z?: number }} [options.origin]
 * @returns {WaveField3D}
 */
export function createWaveField3D(options = {}) {
  const nx = options.nx ?? 16;
  const ny = options.ny ?? 16;
  const nz = options.nz ?? 16;
  const dx = options.dx ?? 1;
  const c = options.c ?? 1;
  // Default dt targets σ ≈ 0.5 / √3 under unit dx — still caller's responsibility.
  const dt = options.dt ?? (0.5 * dx) / (c * Math.sqrt(3));
  const origin = {
    x: options.origin?.x ?? 0,
    y: options.origin?.y ?? 0,
    z: options.origin?.z ?? 0,
  };
  const n = nx * ny * nz;
  return {
    nx,
    ny,
    nz,
    dx,
    c,
    dt,
    origin,
    psi: new Float64Array(n),
    psiPrev: new Float64Array(n),
  };
}

/**
 * Advance the wave field one time step (interior cells only).
 * Uses in-place ping-pong via a scratch buffer to avoid allocating every step.
 *
 * Interior update (second-order wave equation):
 *   ψ_new = 2 ψ − ψ_old + (c dt / dx)² (Σ_neighbors ψ − 6 ψ)
 *
 * Boundary cells remain unchanged (Dirichlet 0 if initialized to zero).
 *
 * @param {WaveField3D} field
 * @param {number} [dt] Override field.dt for this step.
 * @returns {WaveField3D}
 */
export function stepWaveField3D(field, dt = field.dt) {
  const { nx, ny, nz, dx, c, psi, psiPrev } = field;
  const r = (c * dt) / dx;
  const r2 = r * r;

  if (!field._scratch || field._scratch.length !== psi.length) {
    field._scratch = new Float64Array(psi.length);
  }
  const next = field._scratch;

  // Copy boundaries as-is (Dirichlet / unchanged); then overwrite interiors.
  next.set(psi);

  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const p = idx(field, i, j, k);
        const lap =
          psi[idx(field, i + 1, j, k)] +
          psi[idx(field, i - 1, j, k)] +
          psi[idx(field, i, j + 1, k)] +
          psi[idx(field, i, j - 1, k)] +
          psi[idx(field, i, j, k + 1)] +
          psi[idx(field, i, j, k - 1)] -
          6 * psi[p];
        next[p] = 2 * psi[p] - psiPrev[p] + r2 * lap;
      }
    }
  }

  // Ping-pong: psiPrev ← psi, psi ← next (reuse buffers, no new alloc).
  field.psiPrev = psi;
  field.psi = next;
  field._scratch = psiPrev;
  field.dt = dt;
  return field;
}
