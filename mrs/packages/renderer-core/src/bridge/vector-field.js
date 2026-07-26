import { vec3 } from "../math3d/vec3.js";

/**
 * Vector-field helpers (v2/v3).
 *
 * Status: **skeleton** for stepping; **partial** for a simple FD divergence
 * probe used as an optional λ(div V) coupling term — not a Navier–Stokes solver.
 */

/**
 * @typedef {Object} VectorField3D
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {number} dx
 * @property {{ x: number, y: number, z: number }} origin
 * @property {Float64Array} vx
 * @property {Float64Array} vy
 * @property {Float64Array} vz
 * @property {"skeleton"|"partial"} status
 */

/**
 * @param {object} [options]
 * @returns {VectorField3D}
 */
export function createVectorField3D(options = {}) {
  const nx = options.nx ?? 4;
  const ny = options.ny ?? 4;
  const nz = options.nz ?? 4;
  const n = nx * ny * nz;
  return {
    nx,
    ny,
    nz,
    dx: options.dx ?? 1,
    origin: {
      x: options.origin?.x ?? 0,
      y: options.origin?.y ?? 0,
      z: options.origin?.z ?? 0,
    },
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    vz: new Float64Array(n),
    status: "skeleton",
  };
}

/** @param {VectorField3D} field @param {number} i @param {number} j @param {number} k */
function vIdx(field, i, j, k) {
  return i + field.nx * (j + field.ny * k);
}

/**
 * Skeleton: no-op (does not advect or diffuse).
 * @param {VectorField3D} field
 */
export function stepVectorField3D(field) {
  return field;
}

/**
 * Nearest-cell vector sample; OOB → 0.
 * @param {VectorField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 */
export function sampleVectorAtPosition(field, pos) {
  const inv = 1 / field.dx;
  const gx = (pos.x - field.origin.x) * inv;
  const gy = (pos.y - field.origin.y) * inv;
  const gz = (pos.z - field.origin.z) * inv;
  if (gx < 0 || gy < 0 || gz < 0 || gx > field.nx - 1 || gy > field.ny - 1 || gz > field.nz - 1) {
    return vec3();
  }
  const i = Math.min(field.nx - 1, Math.max(0, Math.round(gx)));
  const j = Math.min(field.ny - 1, Math.max(0, Math.round(gy)));
  const k = Math.min(field.nz - 1, Math.max(0, Math.round(gz)));
  const p = vIdx(field, i, j, k);
  return vec3(field.vx[p], field.vy[p], field.vz[p]);
}

/**
 * Central-difference divergence on the grid (nearest cell). Boundary / OOB → 0.
 * Status: **partial** discrete probe only.
 * @param {VectorField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 * @returns {number}
 */
export function vectorFieldDivergenceAtPosition(field, pos) {
  const inv = 1 / field.dx;
  const gx = (pos.x - field.origin.x) * inv;
  const gy = (pos.y - field.origin.y) * inv;
  const gz = (pos.z - field.origin.z) * inv;
  const i = Math.round(gx);
  const j = Math.round(gy);
  const k = Math.round(gz);
  if (i <= 0 || j <= 0 || k <= 0 || i >= field.nx - 1 || j >= field.ny - 1 || k >= field.nz - 1) {
    return 0;
  }
  const dx = field.dx;
  const dVx = (field.vx[vIdx(field, i + 1, j, k)] - field.vx[vIdx(field, i - 1, j, k)]) / (2 * dx);
  const dVy = (field.vy[vIdx(field, i, j + 1, k)] - field.vy[vIdx(field, i, j - 1, k)]) / (2 * dx);
  const dVz = (field.vz[vIdx(field, i, j, k + 1)] - field.vz[vIdx(field, i, j, k - 1)]) / (2 * dx);
  return dVx + dVy + dVz;
}
