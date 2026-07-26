import { vec3 } from "../math3d/vec3.js";

/**
 * Discrete tensor-field helpers for BridgeContract v3.0.
 *
 * Status: **partial** for Tensor3x3, κ=tr(T), sampling, and a **simplified
 * diagonal ∂κ proxy** gradient — not continuum GR, not ∇·T, not space-time warping.
 * `stepTensorField3D` remains a **skeleton** no-op.
 */

/**
 * @typedef {Object} Tensor3x3
 * @property {number} xx
 * @property {number} xy
 * @property {number} xz
 * @property {number} yx
 * @property {number} yy
 * @property {number} yz
 * @property {number} zx
 * @property {number} zy
 * @property {number} zz
 */

/**
 * @typedef {Object} TensorField3D
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {number} dx
 * @property {{ x: number, y: number, z: number }} origin
 * @property {Float64Array} components Length nx*ny*nz*9 (row-major xx..zz per cell).
 * @property {"partial"|"skeleton"} status
 */

/** @returns {Tensor3x3} */
export function tensor3x3(
  xx = 0,
  xy = 0,
  xz = 0,
  yx = 0,
  yy = 0,
  yz = 0,
  zx = 0,
  zy = 0,
  zz = 0,
) {
  return { xx, xy, xz, yx, yy, yz, zx, zy, zz };
}

/** Curvature proxy κ = tr(T) = xx + yy + zz. Not Ricci / continuum curvature. */
export function tensorCurvature(T) {
  return (T?.xx ?? 0) + (T?.yy ?? 0) + (T?.zz ?? 0);
}

/**
 * @param {object} [options]
 * @returns {TensorField3D}
 */
export function createTensorField3D(options = {}) {
  const nx = options.nx ?? 4;
  const ny = options.ny ?? 4;
  const nz = options.nz ?? 4;
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
    components: new Float64Array(nx * ny * nz * 9),
    status: "partial",
  };
}

/** @param {TensorField3D} field @param {number} i @param {number} j @param {number} k */
export function tensorCellBase(field, i, j, k) {
  return 9 * (i + field.nx * (j + field.ny * k));
}

/**
 * @param {TensorField3D} field
 * @param {number} i
 * @param {number} j
 * @param {number} k
 * @param {Tensor3x3} T
 */
export function setTensorAtCell(field, i, j, k, T) {
  const b = tensorCellBase(field, i, j, k);
  const c = field.components;
  c[b] = T.xx;
  c[b + 1] = T.xy;
  c[b + 2] = T.xz;
  c[b + 3] = T.yx;
  c[b + 4] = T.yy;
  c[b + 5] = T.yz;
  c[b + 6] = T.zx;
  c[b + 7] = T.zy;
  c[b + 8] = T.zz;
}

/**
 * @param {TensorField3D} field
 * @param {number} i
 * @param {number} j
 * @param {number} k
 * @returns {Tensor3x3}
 */
export function getTensorAtCell(field, i, j, k) {
  const b = tensorCellBase(field, i, j, k);
  const c = field.components;
  return tensor3x3(c[b], c[b + 1], c[b + 2], c[b + 3], c[b + 4], c[b + 5], c[b + 6], c[b + 7], c[b + 8]);
}

/**
 * Nearest-cell sample; OOB → zero tensor.
 * @param {TensorField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 * @returns {Tensor3x3}
 */
export function sampleTensorAtPosition(field, pos) {
  const inv = 1 / field.dx;
  const gx = (pos.x - field.origin.x) * inv;
  const gy = (pos.y - field.origin.y) * inv;
  const gz = (pos.z - field.origin.z) * inv;
  if (gx < 0 || gy < 0 || gz < 0 || gx > field.nx - 1 || gy > field.ny - 1 || gz > field.nz - 1) {
    return tensor3x3();
  }
  const i = Math.min(field.nx - 1, Math.max(0, Math.round(gx)));
  const j = Math.min(field.ny - 1, Math.max(0, Math.round(gy)));
  const k = Math.min(field.nz - 1, Math.max(0, Math.round(gz)));
  return getTensorAtCell(field, i, j, k);
}

/**
 * Sample κ = tr(T) at a world position (nearest cell).
 * @param {TensorField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 */
export function sampleCurvatureAtPosition(field, pos) {
  return tensorCurvature(sampleTensorAtPosition(field, pos));
}

/**
 * Simplified diagonal ∂κ proxy: central differences of κ=tr(T) on the grid.
 * This is **not** the full tensor divergence ∇·T and does not simulate GR.
 *
 * @param {TensorField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 * @param {number} [h]
 * @returns {{ x: number, y: number, z: number }}
 */
export function tensorGradientAtPosition(field, pos, h = field.dx) {
  const hh = h > 0 ? h : field.dx;
  const inv2h = 1 / (2 * hh);
  const kx =
    sampleCurvatureAtPosition(field, { x: pos.x + hh, y: pos.y, z: pos.z }) -
    sampleCurvatureAtPosition(field, { x: pos.x - hh, y: pos.y, z: pos.z });
  const ky =
    sampleCurvatureAtPosition(field, { x: pos.x, y: pos.y + hh, z: pos.z }) -
    sampleCurvatureAtPosition(field, { x: pos.x, y: pos.y - hh, z: pos.z });
  const kz =
    sampleCurvatureAtPosition(field, { x: pos.x, y: pos.y, z: pos.z + hh }) -
    sampleCurvatureAtPosition(field, { x: pos.x, y: pos.y, z: pos.z - hh });
  return vec3(kx * inv2h, ky * inv2h, kz * inv2h);
}

/**
 * Skeleton time step — intentional no-op (no constitutive tensor evolution).
 * @param {TensorField3D} field
 * @returns {TensorField3D}
 */
export function stepTensorField3D(field) {
  return field;
}
