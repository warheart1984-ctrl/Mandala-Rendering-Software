import { vec3 } from "../math3d/vec3.js";
import { vec4 } from "../math/vec4.js";
import { idx } from "./wave-field-3d.js";

/**
 * Map a 3D position and scalar wave sample into a 4D point.
 * The fourth coordinate is a modulated lift: w = alpha * psi.
 *
 * Status: **partial** — a deterministic lift helper, not a full spacetime embedding.
 *
 * @param {{ x: number, y: number, z: number }} pos3
 * @param {number} psi
 * @param {number} [alpha=1]
 * @returns {{ x: number, y: number, z: number, w: number }}
 */
export function bridgeMap3Dto4D(pos3, psi, alpha = 1) {
  return vec4(pos3.x, pos3.y, pos3.z, alpha * psi);
}

/**
 * Convert world position to continuous grid coordinates (cell-index space).
 * @param {import("./wave-field-3d.js").WaveField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 */
function worldToGrid(field, pos) {
  const inv = 1 / field.dx;
  return {
    gx: (pos.x - field.origin.x) * inv,
    gy: (pos.y - field.origin.y) * inv,
    gz: (pos.z - field.origin.z) * inv,
  };
}

/**
 * Sample the wave field at a world-space position (trilinear).
 * Out-of-bounds → 0.
 *
 * @param {import("./wave-field-3d.js").WaveField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 * @returns {number}
 */
export function sampleWaveAtPosition(field, pos) {
  const { nx, ny, nz, psi } = field;
  const { gx, gy, gz } = worldToGrid(field, pos);

  if (gx < 0 || gy < 0 || gz < 0 || gx > nx - 1 || gy > ny - 1 || gz > nz - 1) {
    return 0;
  }

  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const k0 = Math.floor(gz);
  const i1 = Math.min(i0 + 1, nx - 1);
  const j1 = Math.min(j0 + 1, ny - 1);
  const k1 = Math.min(k0 + 1, nz - 1);
  const tx = gx - i0;
  const ty = gy - j0;
  const tz = gz - k0;

  const c000 = psi[idx(field, i0, j0, k0)];
  const c100 = psi[idx(field, i1, j0, k0)];
  const c010 = psi[idx(field, i0, j1, k0)];
  const c110 = psi[idx(field, i1, j1, k0)];
  const c001 = psi[idx(field, i0, j0, k1)];
  const c101 = psi[idx(field, i1, j0, k1)];
  const c011 = psi[idx(field, i0, j1, k1)];
  const c111 = psi[idx(field, i1, j1, k1)];

  const c00 = c000 * (1 - tx) + c100 * tx;
  const c10 = c010 * (1 - tx) + c110 * tx;
  const c01 = c001 * (1 - tx) + c101 * tx;
  const c11 = c011 * (1 - tx) + c111 * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

/**
 * Approximate ∇ψ at a world position via central differences of samples.
 * Spacing defaults to field.dx. OOB samples contribute 0 (Dirichlet exterior).
 *
 * @param {import("./wave-field-3d.js").WaveField3D} field
 * @param {{ x: number, y: number, z: number }} pos
 * @param {number} [h]
 * @returns {{ x: number, y: number, z: number }}
 */
export function waveGradientAtPosition(field, pos, h = field.dx) {
  const hh = h > 0 ? h : field.dx;
  const inv2h = 1 / (2 * hh);
  const dx =
    sampleWaveAtPosition(field, { x: pos.x + hh, y: pos.y, z: pos.z }) -
    sampleWaveAtPosition(field, { x: pos.x - hh, y: pos.y, z: pos.z });
  const dy =
    sampleWaveAtPosition(field, { x: pos.x, y: pos.y + hh, z: pos.z }) -
    sampleWaveAtPosition(field, { x: pos.x, y: pos.y - hh, z: pos.z });
  const dz =
    sampleWaveAtPosition(field, { x: pos.x, y: pos.y, z: pos.z + hh }) -
    sampleWaveAtPosition(field, { x: pos.x, y: pos.y, z: pos.z - hh });
  return vec3(dx * inv2h, dy * inv2h, dz * inv2h);
}
