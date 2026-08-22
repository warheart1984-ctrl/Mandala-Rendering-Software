/**
 * Holographic bulk ↔ boundary encoding (Claim A only).
 *
 * Bulk = certified spatial scalar slice φ(x,y,z) at fixed t.
 * Boundary = six faces of the spatial cube (compact IR screen channels).
 *
 * 4D→3D operator SoT: ./projector.mjs (P with unit timelike normal on spacelike slice).
 * encodeBoundary stamps projectorDescriptor; face samples use lattice coords after P.
 * Time-as-information: ./translate.mjs (causalStamp / infoDensity).
 *
 * Not AdS/CFT. Not physical vacuum. Computational duality — Claim A.
 * Status: **partial**
 */

import { createHash } from "node:crypto";
import { PROTO_SHAPE, idx } from "../proto/constitution.mjs";
import { nullConstraintOk } from "./metric.mjs";
import {
  projectorDescriptor,
  projectStaticObserver,
  PROJECTOR_IDS,
  c as PROJECTOR_C,
} from "./projector.mjs";

export const HOLOGRAPHY_STATUS = "partial";
export const CLAIM = Object.freeze({
  A: "computational / visualization duality — useful encoding + toy reconstruct",
  B: false,
  note: "Does not claim AdS/CFT or that g_μν emerges from real entanglement.",
});

/** Face channel ids — outward normals on the spatial cube. */
export const FACE_IDS = Object.freeze([
  "negX",
  "posX",
  "negY",
  "posY",
  "negZ",
  "posZ",
]);

/**
 * UV vs IR (computational analogy, mirrors substrate block-average naming):
 * - UV: full-resolution face samples (this encode).
 * - IR: optional single “observation screen” (e.g. posZ) or downsampled faces.
 */
export const UV_IR = Object.freeze({
  uv: "six cube faces at native nx/ny/nz resolution",
  ir: "optional: one screen face (default posZ) or box-downsampled faces — not physics RG",
  status: "partial",
});

function assertShape(shape) {
  const nx = shape?.nx | 0;
  const ny = shape?.ny | 0;
  const nz = shape?.nz | 0;
  if (nx < 2 || ny < 2 || nz < 2) {
    throw new Error(`holography needs nx,ny,nz ≥ 2, got ${nx}×${ny}×${nz}`);
  }
  return { nx, ny, nz, cellCount: nx * ny * nz };
}

function faceByteLength(shape) {
  const { nx, ny, nz } = shape;
  return (ny * nz + ny * nz + nx * nz + nx * nz + nx * ny + nx * ny) * 4;
}

/**
 * Encode the six faces of a bulk scalar cube as boundary channels.
 * Geometry: faces live on a spacelike slice; cell (t,x,y,z) → spatial via
 * projectStaticObserver (P with unit timelike normal) — ≡ P_naive numerically
 * for flat static observer; temporal structure is NOT carried by P alone
 * (see translate.mjs causalStamp / infoDensity).
 *
 * Edge/corner samples are duplicated across adjacent faces (toy compactness > uniqueness).
 *
 * @param {Float32Array|ArrayLike<number>} bulkSlice — length nx*ny*nz
 * @param {{ nx:number, ny:number, nz:number }} [shape]
 * @param {{ t?: number, c?: number }} [opts]
 * @returns {object} boundary representation
 */
export function encodeBoundary(bulkSlice, shape = PROTO_SHAPE, opts = {}) {
  const s = assertShape(shape);
  const { nx, ny, nz } = s;
  const n = s.cellCount;
  if (bulkSlice.length < n) {
    throw new Error(`bulkSlice length ${bulkSlice.length} < cellCount ${n}`);
  }

  const tSlice = opts.t != null ? +opts.t : 0;
  const cVal = opts.c != null ? +opts.c : PROJECTOR_C;
  const projector = projectorDescriptor(cVal);

  const negX = new Float32Array(ny * nz);
  const posX = new Float32Array(ny * nz);
  const negY = new Float32Array(nx * nz);
  const posY = new Float32Array(nx * nz);
  const negZ = new Float32Array(nx * ny);
  const posZ = new Float32Array(nx * ny);

  // Sample φ at lattice sites whose spatial coords are the image under P
  let k = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      const pL = projectStaticObserver([tSlice, 0, y, z], cVal);
      const pR = projectStaticObserver([tSlice, nx - 1, y, z], cVal);
      negX[k] = bulkSlice[idx(Math.round(pL.x), Math.round(pL.y), Math.round(pL.z), s)];
      posX[k] = bulkSlice[idx(Math.round(pR.x), Math.round(pR.y), Math.round(pR.z), s)];
      k++;
    }
  }
  k = 0;
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const pB = projectStaticObserver([tSlice, x, 0, z], cVal);
      const pT = projectStaticObserver([tSlice, x, ny - 1, z], cVal);
      negY[k] = bulkSlice[idx(Math.round(pB.x), Math.round(pB.y), Math.round(pB.z), s)];
      posY[k] = bulkSlice[idx(Math.round(pT.x), Math.round(pT.y), Math.round(pT.z), s)];
      k++;
    }
  }
  k = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const pN = projectStaticObserver([tSlice, x, y, 0], cVal);
      const pF = projectStaticObserver([tSlice, x, y, nz - 1], cVal);
      negZ[k] = bulkSlice[idx(Math.round(pN.x), Math.round(pN.y), Math.round(pN.z), s)];
      posZ[k] = bulkSlice[idx(Math.round(pF.x), Math.round(pF.y), Math.round(pF.z), s)];
      k++;
    }
  }

  const faces = { negX, posX, negY, posY, negZ, posZ };
  const hash = hashBoundary(faces, s);

  return {
    kind: "cube-faces-boundary",
    status: HOLOGRAPHY_STATUS,
    claim: CLAIM,
    uvIr: UV_IR,
    shape: { nx, ny, nz, cellCount: n },
    faces,
    faceIds: FACE_IDS,
    byteLength: faceByteLength(s),
    bulkByteLength: n * 4,
    hash,
    t: tSlice,
    projectorId: PROJECTOR_IDS.STATIC_OBSERVER,
    projector,
    note:
      "Face φ sampled after P_static (≡ P_naive spatially). Time→information is not this operator.",
  };
}

export function hashBoundary(faces, shape) {
  const h = createHash("sha256");
  h.update("mandala.holography.boundary.v0");
  h.update(`\0${shape.nx}x${shape.ny}x${shape.nz}\0`);
  for (const id of FACE_IDS) {
    const f = faces[id];
    h.update(id);
    h.update(Buffer.from(f.buffer, f.byteOffset, f.byteLength));
  }
  return h.digest("hex");
}

/**
 * Coarse interior estimate from six faces.
 * Default: axis-linear blend (legacy toy).
 * If boundary.h_ij / omega present (BoundaryInformation), weights use conformal
 * factor Ω so “distances” respect induced-metric-aware blend (still approximate).
 *
 * Deterministic. Not harmonic PDE; not entanglement / RT reconstruction.
 * Must never write into certified buffers (caller supplies boundary only).
 *
 * @param {object} boundary — from encodeBoundary or bulkToBoundaryInformation
 * @param {{ metricAware?: boolean, enforceNullStub?: boolean }} [opts]
 * @returns {Float32Array} coarse bulk preview (same shape as boundary.shape)
 */
export function reconstructBulkPreview(boundary, opts = {}) {
  if (!boundary?.faces || !boundary?.shape) {
    throw new Error("reconstructBulkPreview requires encodeBoundary / BoundaryInformation");
  }
  const { nx, ny, nz } = assertShape(boundary.shape);
  const { negX, posX, negY, posY, negZ, posZ } = boundary.faces;
  const out = new Float32Array(nx * ny * nz);

  const invX = nx > 1 ? 1 / (nx - 1) : 0;
  const invY = ny > 1 ? 1 / (ny - 1) : 0;
  const invZ = nz > 1 ? 1 / (nz - 1) : 0;

  const metricAware =
    opts.metricAware !== false &&
    (boundary.h_ij != null || boundary.omega != null || boundary.inducedMetricId);
  const omega = metricAware && Number.isFinite(boundary.omega) ? +boundary.omega : 1;
  // Conformal h = Ω² δ → blend weights along each axis scale with Ω (cheap stand-in)
  const wMetric = metricAware ? Math.max(1e-6, omega) : 1;

  let nullViolations = 0;
  const enforceNull = !!opts.enforceNullStub;

  for (let z = 0; z < nz; z++) {
    const tz = z * invZ;
    for (let y = 0; y < ny; y++) {
      const ty = y * invY;
      const yzNeg = y + ny * z;
      const yzPos = yzNeg;
      for (let x = 0; x < nx; x++) {
        const tx = x * invX;
        // Metric-aware: slightly emphasize mid-axis (harmonic-ish) via Ω
        const sx = metricAware ? smoothStep(tx) : tx;
        const sy = metricAware ? smoothStep(ty) : ty;
        const sz = metricAware ? smoothStep(tz) : tz;
        const fromX = (1 - sx) * negX[yzNeg] + sx * posX[yzPos];
        const fromY = (1 - sy) * negY[x + nx * z] + sy * posY[x + nx * z];
        const fromZ = (1 - sz) * negZ[x + nx * y] + sz * posZ[x + nx * y];
        let val = (fromX + fromY + fromZ) / 3;
        if (metricAware && boundary.causalStamp) {
          // Mix a tiny causalStamp mid-face average as temporal info (preview only)
          const stampMix =
            0.02 *
            0.25 *
            (stampAt(boundary, "negX", yzNeg) +
              stampAt(boundary, "posX", yzPos) +
              stampAt(boundary, "negZ", x + nx * y) +
              stampAt(boundary, "posZ", x + nx * y));
          val = (val * wMetric + stampMix) / (wMetric + 0.02);
        } else if (metricAware) {
          val *= (2 + wMetric) / (2 + 1);
        }
        if (enforceNull) {
          // Stub: from face to cell, spatial steps vs unit Δt=1 lattice hop
          const dx = Math.min(x, nx - 1 - x);
          if (!nullConstraintOk(dx, 0, 0, Math.max(1, dx))) nullViolations++;
        }
        out[idx(x, y, z, { nx, ny, nz })] = val;
      }
    }
  }
  void nullViolations;
  return out;
}

function smoothStep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function stampAt(boundary, faceId, i) {
  const s = boundary.causalStamp?.[faceId];
  if (!s || i < 0 || i >= s.length) return 0;
  return s[i];
}

/**
 * Flatten infoDensity faces into one RGB holographic-screen heatmap.
 */
export function boundaryInfoDensityBitmap(boundaryInfo) {
  if (!boundaryInfo?.infoDensity || !boundaryInfo?.shape) {
    throw new Error("boundaryInfoDensityBitmap requires BoundaryInformation");
  }
  const { nx, ny, nz } = assertShape(boundaryInfo.shape);
  const dens = boundaryInfo.infoDensity;
  const cellW = Math.max(nx, ny);
  const cellH = Math.max(ny, nz);
  const width = cellW * 3;
  const height = cellH * 2;
  const rgb = new Uint8Array(width * height * 3);

  const slots = [
    { id: "negX", col: 0, row: 0, w: ny, h: nz },
    { id: "posX", col: 1, row: 0, w: ny, h: nz },
    { id: "negY", col: 2, row: 0, w: nx, h: nz },
    { id: "posY", col: 0, row: 1, w: nx, h: nz },
    { id: "negZ", col: 1, row: 1, w: nx, h: ny },
    { id: "posZ", col: 2, row: 1, w: nx, h: ny },
  ];

  let min = Infinity;
  let max = -Infinity;
  for (const id of FACE_IDS) {
    const f = dens[id];
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min || 1;

  for (const slot of slots) {
    const f = dens[slot.id];
    const ox = slot.col * cellW;
    const oy = slot.row * cellH;
    for (let j = 0; j < slot.h; j++) {
      for (let i = 0; i < slot.w; i++) {
        const v = f[i + slot.w * j];
        const t = (v - min) / span;
        const g = Math.max(0, Math.min(255, Math.round(t * 255)));
        const px = ox + i;
        const py = oy + j;
        const o = (px + width * py) * 3;
        // Heatmap: cool → warm (info density), not “entanglement”
        rgb[o] = Math.min(255, Math.round(40 + t * 215));
        rgb[o + 1] = Math.min(255, Math.round(20 + (1 - t) * 100 + g * 0.35));
        rgb[o + 2] = Math.min(255, Math.round(80 + (1 - t) * 175));
      }
    }
  }

  return {
    width,
    height,
    rgb,
    min,
    max,
    note: "holographic screen — infoDensity heatmap (correlation proxy), not von Neumann entropy",
  };
}

/**
 * Mid-plane Z slice of a volume (for visualization).
 */
export function midSliceZ(volume, shape = PROTO_SHAPE) {
  const s = assertShape(shape);
  const z = (s.nz / 2) | 0;
  const plane = new Float32Array(s.nx * s.ny);
  let i = 0;
  for (let y = 0; y < s.ny; y++) {
    for (let x = 0; x < s.nx; x++) {
      plane[i++] = volume[idx(x, y, z, s)];
    }
  }
  return { plane, width: s.nx, height: s.ny, z };
}

/**
 * Flatten six faces into one RGB “entanglement bitmap” (toy visualization).
 * Layout: 3×2 grid of faces, each face as grayscale mapped to RGB.
 */
export function boundaryToEntanglementBitmap(boundary) {
  const { nx, ny, nz } = assertShape(boundary.shape);
  const { faces } = boundary;
  const cellW = Math.max(nx, ny);
  const cellH = Math.max(ny, nz);
  const width = cellW * 3;
  const height = cellH * 2;
  const rgb = new Uint8Array(width * height * 3);

  const slots = [
    { id: "negX", col: 0, row: 0, w: ny, h: nz },
    { id: "posX", col: 1, row: 0, w: ny, h: nz },
    { id: "negY", col: 2, row: 0, w: nx, h: nz },
    { id: "posY", col: 0, row: 1, w: nx, h: nz },
    { id: "negZ", col: 1, row: 1, w: nx, h: ny },
    { id: "posZ", col: 2, row: 1, w: nx, h: ny },
  ];

  let min = Infinity;
  let max = -Infinity;
  for (const id of FACE_IDS) {
    const f = faces[id];
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min || 1;

  for (const slot of slots) {
    const f = faces[slot.id];
    const ox = slot.col * cellW;
    const oy = slot.row * cellH;
    for (let j = 0; j < slot.h; j++) {
      for (let i = 0; i < slot.w; i++) {
        const v = f[i + slot.w * j];
        const g = Math.max(0, Math.min(255, Math.round(((v - min) / span) * 255)));
        const px = ox + i;
        const py = oy + j;
        const o = (px + width * py) * 3;
        rgb[o] = g;
        rgb[o + 1] = g;
        rgb[o + 2] = Math.min(255, g + 24);
      }
    }
  }

  return { width, height, rgb, min, max, note: "toy entanglement bitmap — not quantum data" };
}

/**
 * Scalar plane → RGB888.
 */
export function scalarPlaneToRgb(plane, width, height) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < plane.length; i++) {
    const g = Math.max(0, Math.min(255, Math.round(((plane[i] - min) / span) * 255)));
    const o = i * 3;
    rgb[o] = g;
    rgb[o + 1] = Math.min(255, g + 8);
    rgb[o + 2] = Math.min(255, 40 + ((255 - g) >> 2));
  }
  return { rgb, min, max };
}
