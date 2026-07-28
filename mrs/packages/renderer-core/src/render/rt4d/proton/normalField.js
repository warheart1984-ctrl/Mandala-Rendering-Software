/**
 * CECP Mod 5 — ProtonRaster→NormalField
 *
 * STATUS: **enforced**
 *
 * Weighted-average view normals from splat; renormalize.
 * Guarantees: no NaN; zero vector where weight≈0; else ‖n‖≈1.
 */

/**
 * @typedef {object} NormalField
 * @property {number} width
 * @property {number} height
 * @property {Float32Array} normals  packed xyz
 * @property {string} status
 */

/**
 * @param {import("./rasterizeProtons.js").ProtonRaster} raster
 * @returns {NormalField}
 */
export function normalsFromRaster(raster) {
  if (!raster || !(raster.normalSum instanceof Float32Array)) {
    throw new Error("normalsFromRaster: ProtonRaster with normalSum required");
  }
  const { width, height, normalSum, depthWeight } = raster;
  const n = width * height;
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const w = depthWeight[i] || 0;
    const ni = i * 3;
    if (w < 1e-12) {
      normals[ni] = 0;
      normals[ni + 1] = 0;
      normals[ni + 2] = 0;
      continue;
    }
    let x = normalSum[ni] / w;
    let y = normalSum[ni + 1] / w;
    let z = normalSum[ni + 2] / w;
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len < 1e-12) {
      normals[ni] = 0;
      normals[ni + 1] = 0;
      normals[ni + 2] = 0;
    } else {
      normals[ni] = x / len;
      normals[ni + 1] = y / len;
      normals[ni + 2] = z / len;
    }
  }
  return { width, height, normals, status: "enforced" };
}

/**
 * @param {NormalField} field
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function assertNormalFieldInvariants(field) {
  /** @type {string[]} */
  const errors = [];
  const n = field.width * field.height;
  for (let i = 0; i < n; i++) {
    const ni = i * 3;
    const x = field.normals[ni];
    const y = field.normals[ni + 1];
    const z = field.normals[ni + 2];
    if (![x, y, z].every(Number.isFinite)) {
      errors.push(`NaN/Inf normal at ${i}`);
      continue;
    }
    const len = Math.hypot(x, y, z);
    if (len > 1e-6 && Math.abs(len - 1) > 1e-3) {
      errors.push(`non-unit normal at ${i} len=${len}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
