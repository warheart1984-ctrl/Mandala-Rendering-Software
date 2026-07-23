/**
 * 4D Lattice — voxel grid in ℝ⁴.
 *
 * L = { (i,j,k,l) | i,j,k,l ∈ ℤ }
 *
 * Supports:
 *   - Density fields (4D scalar field)
 *   - Analytical functions
 *   - Procedural noise filling
 *   - Slicing via hyperplane
 *   - Isosurface extraction via marching cubes
 */

/**
 * Create a 4D lattice grid.
 * @param {object} options
 * @param {number} options.resX - resolution in X
 * @param {number} options.resY - resolution in Y
 * @param {number} options.resZ - resolution in Z
 * @param {number} options.resW - resolution in W
 * @param {number} options.scaleX - physical size in X
 * @param {number} options.scaleY - physical size in Y
 * @param {number} options.scaleZ - physical size in Z
 * @param {number} options.scaleW - physical size in W
 * @param {number} options.centerX - center X
 * @param {number} options.centerY - center Y
 * @param {number} options.centerZ - center Z
 * @param {number} options.centerW - center W
 */
export function createLattice(options = {}) {
  const resX = options.resX ?? 32;
  const resY = options.resY ?? 32;
  const resZ = options.resZ ?? 32;
  const resW = options.resW ?? 32;
  const scaleX = options.scaleX ?? 4;
  const scaleY = options.scaleY ?? 4;
  const scaleZ = options.scaleZ ?? 4;
  const scaleW = options.scaleW ?? 4;
  const centerX = options.centerX ?? 0;
  const centerY = options.centerY ?? 0;
  const centerZ = options.centerZ ?? 0;
  const centerW = options.centerW ?? 0;

  const totalCells = resX * resY * resZ * resW;
  const density = new Float32Array(totalCells);

  return {
    resX, resY, resZ, resW,
    scaleX, scaleY, scaleZ, scaleW,
    centerX, centerY, centerZ, centerW,
    density,
    totalCells,
  };
}

/**
 * Convert grid indices (i,j,k,l) to world coordinates (x,y,z,w).
 */
export function gridToWorld(lattice, i, j, k, l) {
  const { resX, resY, resZ, resW, scaleX, scaleY, scaleZ, scaleW, centerX, centerY, centerZ, centerW } = lattice;
  return {
    x: centerX + (i / (resX - 1) - 0.5) * scaleX,
    y: centerY + (j / (resY - 1) - 0.5) * scaleY,
    z: centerZ + (k / (resZ - 1) - 0.5) * scaleZ,
    w: centerW + (l / (resW - 1) - 0.5) * scaleW,
  };
}

/**
 * Convert world coordinates to grid indices (fractional).
 */
export function worldToGrid(lattice, x, y, z, w) {
  const { resX, resY, resZ, resW, scaleX, scaleY, scaleZ, scaleW, centerX, centerY, centerZ, centerW } = lattice;
  return {
    i: ((x - centerX) / scaleX + 0.5) * (resX - 1),
    j: ((y - centerY) / scaleY + 0.5) * (resY - 1),
    k: ((z - centerZ) / scaleZ + 0.5) * (resZ - 1),
    l: ((w - centerW) / scaleW + 0.5) * (resW - 1),
  };
}

/**
 * Get flat index from 4D grid coordinates.
 */
function flatIndex(lattice, i, j, k, l) {
  return (
    i * lattice.resY * lattice.resZ * lattice.resW +
    j * lattice.resZ * lattice.resW +
    k * lattice.resW +
    l
  );
}

/**
 * Get density at grid position.
 */
export function getDensity(lattice, i, j, k, l) {
  if (i < 0 || i >= lattice.resX || j < 0 || j >= lattice.resY ||
      k < 0 || k >= lattice.resZ || l < 0 || l >= lattice.resW) {
    return 0;
  }
  return lattice.density[flatIndex(lattice, i, j, k, l)];
}

/**
 * Set density at grid position.
 */
export function setDensity(lattice, i, j, k, l, value) {
  if (i < 0 || i >= lattice.resX || j < 0 || j >= lattice.resY ||
      k < 0 || k >= lattice.resZ || l < 0 || l >= lattice.resW) {
    return;
  }
  lattice.density[flatIndex(lattice, i, j, k, l)] = value;
}

/**
 * Fill lattice with an analytical function.
 * @param {Lattice} lattice
 * @param {function({x,y,z,w}): number} fn - density function
 */
export function fillLattice(lattice, fn) {
  for (let i = 0; i < lattice.resX; i++) {
    for (let j = 0; j < lattice.resY; j++) {
      for (let k = 0; k < lattice.resZ; k++) {
        for (let l = 0; l < lattice.resW; l++) {
          const world = gridToWorld(lattice, i, j, k, l);
          const value = fn(world.x, world.y, world.z, world.w);
          setDensity(lattice, i, j, k, l, value);
        }
      }
    }
  }
  return lattice;
}

/**
 * Sample the lattice at arbitrary world coordinates using trilinear interpolation.
 * @param {Lattice} lattice
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @returns {number} interpolated density
 */
export function sampleLattice(lattice, x, y, z, w) {
  const g = worldToGrid(lattice, x, y, z, w);

  // Clamp to grid bounds
  const i0 = Math.max(0, Math.min(lattice.resX - 2, Math.floor(g.i)));
  const j0 = Math.max(0, Math.min(lattice.resY - 2, Math.floor(g.j)));
  const k0 = Math.max(0, Math.min(lattice.resZ - 2, Math.floor(g.k)));
  const l0 = Math.max(0, Math.min(lattice.resW - 2, Math.floor(g.l)));

  const fi = g.i - i0;
  const fj = g.j - j0;
  const fk = g.k - k0;
  const fl = g.l - l0;

  // Trilinear interpolation (actually 4-linear for 4D)
  const c000 = getDensity(lattice, i0, j0, k0, l0);
  const c001 = getDensity(lattice, i0, j0, k0, l0 + 1);
  const c010 = getDensity(lattice, i0, j0 + 1, k0, l0);
  const c011 = getDensity(lattice, i0, j0 + 1, k0, l0 + 1);
  const c100 = getDensity(lattice, i0 + 1, j0, k0, l0);
  const c101 = getDensity(lattice, i0 + 1, j0, k0, l0 + 1);
  const c110 = getDensity(lattice, i0 + 1, j0 + 1, k0, l0);
  const c111 = getDensity(lattice, i0 + 1, j0 + 1, k0, l0 + 1);

  const c00 = c000 * (1 - fl) + c001 * fl;
  const c01 = c010 * (1 - fl) + c011 * fl;
  const c10 = c100 * (1 - fl) + c101 * fl;
  const c11 = c110 * (1 - fl) + c111 * fl;

  const c0 = c00 * (1 - fk) + c01 * fk;
  const c1 = c10 * (1 - fk) + c11 * fk;

  return c0 * (1 - fj) + c1 * fj;
}

/**
 * Compute gradient of density field at a grid position.
 * @returns {{dx: number, dy: number, dz: number, dw: number}}
 */
export function latticeGradient(lattice, i, j, k, l) {
  const dx = (getDensity(lattice, i + 1, j, k, l) - getDensity(lattice, i - 1, j, k, l)) / 2;
  const dy = (getDensity(lattice, i, j + 1, k, l) - getDensity(lattice, i, j - 1, k, l)) / 2;
  const dz = (getDensity(lattice, i, j, k + 1, l) - getDensity(lattice, i, j, k - 1, l)) / 2;
  const dw = (getDensity(lattice, i, j, k, l + 1) - getDensity(lattice, i, j, k, l - 1)) / 2;
  return { dx, dy, dz, dw };
}

/**
 * Extract the 3D slice of the lattice at a given W coordinate.
 * Returns a 3D grid of density values.
 */
export function sliceLatticeAtW(lattice, wCoord) {
  const g = worldToGrid(lattice, 0, 0, 0, wCoord);
  const l = Math.round(Math.max(0, Math.min(lattice.resW - 1, g.l)));

  const slice = {
    resX: lattice.resX,
    resY: lattice.resY,
    resZ: lattice.resZ,
    density: new Float32Array(lattice.resX * lattice.resY * lattice.resZ),
  };

  for (let i = 0; i < lattice.resX; i++) {
    for (let j = 0; j < lattice.resY; j++) {
      for (let k = 0; k < lattice.resZ; k++) {
        const idx = i * lattice.resY * lattice.resZ + j * lattice.resZ + k;
        slice.density[idx] = getDensity(lattice, i, j, k, l);
      }
    }
  }

  return slice;
}

/**
 * Get bounds of the lattice in world space.
 */
export function latticeBounds(lattice) {
  const min = gridToWorld(lattice, 0, 0, 0, 0);
  const max = gridToWorld(lattice, lattice.resX - 1, lattice.resY - 1, lattice.resZ - 1, lattice.resW - 1);
  return { min, max };
}

/**
 * Get lattice statistics.
 */
export function latticeStats(lattice) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nonZero = 0;

  for (let i = 0; i < lattice.totalCells; i++) {
    const v = lattice.density[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (Math.abs(v) > 0.001) nonZero++;
  }

  return {
    min, max,
    mean: sum / lattice.totalCells,
    nonZeroCells: nonZero,
    totalCells: lattice.totalCells,
    fillRatio: nonZero / lattice.totalCells,
  };
}
