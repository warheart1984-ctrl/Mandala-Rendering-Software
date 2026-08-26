/**
 * Depth-grid → Spatial Token (HoloRT4D-Spatial-V1).
 *
 * Status: enforced for Float32 depth grids from chamber / opticalLength / landmark-z.
 * Curvature + normals from neighborhood gradients (finite differences).
 */

import { SPATIAL_TOKEN_SCHEME } from "./status.js";
import { clampByte, createGridCell, createSpatialToken } from "./types.js";

/**
 * @typedef {object} TokenizeOptions
 * @property {number} width
 * @property {number} height
 * @property {8|16} [resolution]
 * @property {number} [depthMin]  absolute min for binning (default: data min)
 * @property {number} [depthMax]  absolute max for binning (default: data max)
 * @property {Float32Array|number[]} [prevDepth]  optional previous frame for motion
 * @property {Float32Array|number[]} [flow]       optional packed flow dx,dy per pixel
 * @property {import('./face.js').FaceRigLike} [faceRig]
 * @property {object} [meta]
 */

/**
 * Bin a dense depth map into a resolution×resolution spatial token grid.
 *
 * @param {Float32Array|number[]} depthF32
 * @param {TokenizeOptions} opts
 * @returns {import('./types.js').SpatialToken}
 */
export function tokenizeFromDepthGrid(depthF32, opts) {
  const width = Number(opts.width);
  const height = Number(opts.height);
  const resolution = /** @type {8|16} */ (Number(opts.resolution ?? 16));
  if (resolution !== 8 && resolution !== 16) {
    throw new Error(`resolution must be 8 or 16, got ${resolution}`);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("width/height must be positive");
  }
  const n = width * height;
  if (depthF32.length < n) {
    throw new Error(`depthF32 length ${depthF32.length} < width*height ${n}`);
  }

  let dMin = opts.depthMin;
  let dMax = opts.depthMax;
  if (dMin == null || dMax == null) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = Number(depthF32[i]);
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    if (dMin == null) dMin = lo;
    if (dMax == null) dMax = hi === lo ? lo + 1 : hi;
  }
  const span = dMax - dMin || 1;

  const cellW = width / resolution;
  const cellH = height / resolution;
  /** @type {import('./types.js').GridCell[]} */
  const cells = [];

  for (let cy = 0; cy < resolution; cy++) {
    for (let cx = 0; cx < resolution; cx++) {
      const cellIndex = cy * resolution + cx;
      const x0 = Math.floor(cx * cellW);
      const y0 = Math.floor(cy * cellH);
      const x1 = Math.min(width, Math.ceil((cx + 1) * cellW));
      const y1 = Math.min(height, Math.ceil((cy + 1) * cellH));

      let sum = 0;
      let count = 0;
      let sumAbsLap = 0;
      let sumNx = 0;
      let sumNy = 0;
      let sumNz = 0;
      let motionDx = 0;
      let motionDy = 0;
      let motionMag = 0;
      let motionCount = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * width + x;
          const d = Number(depthF32[i]);
          if (!Number.isFinite(d)) continue;
          sum += d;
          count += 1;

          const { nx, ny, nz, curvature } = sampleGrad(depthF32, width, height, x, y);
          sumNx += nx;
          sumNy += ny;
          sumNz += nz;
          sumAbsLap += curvature;

          if (opts.prevDepth && opts.prevDepth.length >= n) {
            const pd = Number(opts.prevDepth[i]);
            if (Number.isFinite(pd)) {
              // Approximate motion as depth delta projected to image gradient direction
              const dd = d - pd;
              motionDx += nx * dd;
              motionDy += ny * dd;
              motionMag += Math.abs(dd);
              motionCount += 1;
            }
          }
          if (opts.flow && opts.flow.length >= n * 2) {
            const fdx = Number(opts.flow[i * 2]);
            const fdy = Number(opts.flow[i * 2 + 1]);
            if (Number.isFinite(fdx) && Number.isFinite(fdy)) {
              motionDx += fdx;
              motionDy += fdy;
              motionMag += Math.hypot(fdx, fdy);
              motionCount += 1;
            }
          }
        }
      }

      const meanDepth = count > 0 ? sum / count : dMin;
      const depthByte = clampByte(((meanDepth - dMin) / span) * 255);
      const inv = count > 0 ? 1 / count : 0;
      let nx = sumNx * inv;
      let ny = sumNy * inv;
      let nz = sumNz * inv;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const curvature = count > 0 ? sumAbsLap * inv : 0;

      /** @type {Partial<import('./types.js').GridCell>} */
      const partial = {
        cell: cellIndex,
        depth: depthByte,
        curvature,
        normal: [nx, ny, nz],
      };

      if (motionCount > 0) {
        const mInv = 1 / motionCount;
        partial.motion = {
          dx: motionDx * mInv,
          dy: motionDy * mInv,
          mag: motionMag * mInv,
        };
      }

      cells.push(createGridCell(partial));
    }
  }

  // Optional face region labels (partial)
  if (opts.faceRig) {
    applyFaceLabels(cells, opts.faceRig, width, height, resolution);
  }

  return createSpatialToken({
    scheme: SPATIAL_TOKEN_SCHEME,
    resolution,
    width,
    height,
    cells,
    meta: {
      depthMin: dMin,
      depthMax: dMax,
      ...(opts.meta ?? {}),
    },
  });
}

/**
 * Finite-difference gradient → approximate surface normal + curvature.
 * @param {Float32Array|number[]} depth
 * @param {number} w
 * @param {number} h
 * @param {number} x
 * @param {number} y
 */
function sampleGrad(depth, w, h, x, y) {
  const at = (xx, yy) => {
    const cx = Math.max(0, Math.min(w - 1, xx));
    const cy = Math.max(0, Math.min(h - 1, yy));
    const v = Number(depth[cy * w + cx]);
    return Number.isFinite(v) ? v : 0;
  };
  const dzdx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
  const dzdy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
  const lap =
    at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1) - 4 * at(x, y);
  // Normal pointing toward camera (+Z) from depth gradient
  let nx = -dzdx;
  let ny = -dzdy;
  let nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return {
    nx,
    ny,
    nz,
    curvature: Math.abs(lap) + Math.hypot(dzdx, dzdy),
  };
}

/**
 * @param {import('./types.js').GridCell[]} cells
 * @param {import('./face.js').FaceRigLike} faceRig
 * @param {number} width
 * @param {number} height
 * @param {number} resolution
 */
function applyFaceLabels(cells, faceRig, width, height, resolution) {
  // Lazy import avoided — face helpers inlined to keep CPU path sync
  const landmarks = faceRig.landmarks;
  if (!Array.isArray(landmarks) || landmarks.length === 0) return;

  const cellW = width / resolution;
  const cellH = height / resolution;

  /** @type {Map<number, Map<string, number>>} */
  const votes = new Map();

  for (const lm of landmarks) {
    const lx = Number(lm.x);
    const ly = Number(lm.y);
    // Assume normalized [-1,1] or pixel; detect
    let px;
    let py;
    if (Math.abs(lx) <= 1.5 && Math.abs(ly) <= 1.5) {
      px = ((lx + 1) * 0.5) * (width - 1);
      py = ((1 - ly) * 0.5) * (height - 1); // y-up → image y-down
    } else {
      px = lx;
      py = ly;
    }
    const cx = Math.max(0, Math.min(resolution - 1, Math.floor(px / cellW)));
    const cy = Math.max(0, Math.min(resolution - 1, Math.floor(py / cellH)));
    const cellIndex = cy * resolution + cx;
    const label = regionForLandmark(Number(lm.id ?? 0), lm.bone);
    if (!votes.has(cellIndex)) votes.set(cellIndex, new Map());
    const m = votes.get(cellIndex);
    m.set(label, (m.get(label) ?? 0) + 1);
  }

  for (const cell of cells) {
    const m = votes.get(cell.cell);
    if (!m || m.size === 0) continue;
    let best = null;
    let bestN = -1;
    for (const [label, n] of m) {
      if (n > bestN) {
        bestN = n;
        best = label;
      }
    }
    if (best) cell.object = best;
  }
}

/**
 * @param {number} id
 * @param {string} [bone]
 */
function regionForLandmark(id, bone) {
  if (bone && typeof bone === "string") {
    const b = bone.toLowerCase();
    if (b.includes("jaw")) return "face.jaw";
    if (b.includes("brow")) return "face.brow";
    if (b.includes("nose")) return "face.nose";
    if (b.includes("eye")) return "face.eye";
    if (b.includes("mouth") || b.includes("lip")) return "face.mouth";
  }
  if (id <= 16) return "face.jaw";
  if (id <= 26) return "face.brow";
  if (id <= 35) return "face.nose";
  if (id <= 47) return "face.eye";
  return "face.mouth";
}
