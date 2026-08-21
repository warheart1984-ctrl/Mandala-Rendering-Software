/**
 * Raw Float32 holographic frame writer (partial).
 *
 * Codec: `raw-float32`
 * Layout (documented in meta.json):
 *   bytes 0–3   u32 count   (active / written node count)
 *   bytes 4–7   u32 t       (frame index f, not bulk.t)
 *   bytes 8–43  f32[9] h_ij (row-major 3×3 induced metric)
 *   bytes 44–63 pad (zeros)
 *   then contiguous float32 attributes (count-bounded, no 8192 tail):
 *     position(count*3), entanglementDensity(count),
 *     entanglementDirection(count*3), curvature(count),
 *     entanglementWeight(count), governance(count*4), baseNormal(count*3)
 *
 * Sparse ρ (partial): optional compact of nodes with ρ < vacuumRho when writing.
 * Does not rewrite bone/joint topology — compact is for draw/write only.
 */

import { writeFileSync } from "node:fs";

export const BIN_FRAME_CODEC = "raw-float32";
export const BIN_FRAME_HEADER_BYTES = 64;
export const BIN_FRAME_STATUS = "partial";
export const BIN_SPARSE_STATUS = "partial";
/** Canonical sparse ρ threshold (alias RHO_SPARSE). */
export const RHO_SPARSE = 0.05;
export const BIN_VACUUM_RHO_DEFAULT = RHO_SPARSE;

export const BIN_FRAME_ATTRIBUTES = Object.freeze([
  { name: "position", components: 3 },
  { name: "entanglementDensity", components: 1 },
  { name: "entanglementDirection", components: 3 },
  { name: "curvature", components: 1 },
  { name: "entanglementWeight", components: 1 },
  { name: "governance", components: 4 },
  { name: "baseNormal", components: 3 },
]);

/** Floats per node after header (3+1+3+1+1+4+3). */
export const BIN_FLOATS_PER_NODE = BIN_FRAME_ATTRIBUTES.reduce(
  (n, a) => n + a.components,
  0,
);

/**
 * Safe Buffer view of a TypedArray (handles subarrays).
 * @param {ArrayBufferView} arr
 */
export function typedArrayToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Build 64-byte header: u32 count, u32 t, f32[9] h_ij, pad.
 * Uses separate views so count/t are not corrupted by h_ij packing.
 * @param {number} count
 * @param {number} t frame index
 * @param {ArrayLike<number>|null} h_ij
 */
export function buildBinHeader(count, t, h_ij = null) {
  const header = new ArrayBuffer(BIN_FRAME_HEADER_BYTES);
  const u32 = new Uint32Array(header, 0, 2);
  u32[0] = count >>> 0;
  u32[1] = t >>> 0;
  // bytes 8–43: nine float32s (overlaps nothing with u32[0]/u32[1])
  const hij = new Float32Array(header, 8, 9);
  const src = h_ij?.elements || h_ij;
  if (src && src.length >= 9) {
    for (let i = 0; i < 9; i++) hij[i] = +src[i] || 0;
  } else {
    hij[0] = 1;
    hij[4] = 1;
    hij[8] = 1;
  }
  return header;
}

/**
 * Compact active node indices where ρ >= vacuumRho.
 * Bone/joint connectivity is not rewritten — caller keeps full rig.
 * @param {Float32Array|ArrayLike<number>} rho
 * @param {number} count
 * @param {number} [vacuumRho]
 * @returns {Uint32Array} active indices
 */
export function activeNodeIndices(rho, count, vacuumRho = BIN_VACUUM_RHO_DEFAULT) {
  const tmp = [];
  for (let i = 0; i < count; i++) {
    if ((rho[i] ?? 0) >= vacuumRho) tmp.push(i);
  }
  // If everything is vacuum, keep at least nothing — empty frame is valid.
  return Uint32Array.from(tmp);
}

/**
 * Gather count-bounded attribute views from holoBuffers / _bufferCache.
 * @param {object} buffers renderer.holoBuffers-like
 * @param {number} [count]
 */
export function viewsFromHoloBuffers(buffers, count = buffers?.count) {
  if (!buffers || !Number.isFinite(count) || count < 0) {
    throw new Error("viewsFromHoloBuffers requires buffers + count");
  }
  const n = count | 0;
  return {
    count: n,
    h_ij: buffers.h_ij || null,
    position: takeF32(buffers.position, n * 3),
    entanglementDensity: takeF32(buffers.entanglementDensity, n),
    entanglementDirection: takeF32(buffers.entanglementDirection, n * 3),
    curvature: takeF32(buffers.curvature, n),
    entanglementWeight: takeF32(buffers.entanglementWeight, n),
    governance: takeF32(buffers.governance, n * 4),
    baseNormal: takeF32(buffers.baseNormal, n * 3),
  };
}

function takeF32(arr, len) {
  if (!(arr instanceof Float32Array) && !ArrayBuffer.isView(arr)) {
    throw new Error(`expected Float32Array view, got ${typeof arr}`);
  }
  if (arr.length < len) {
    throw new Error(`attribute length ${arr.length} < required ${len}`);
  }
  return arr instanceof Float32Array
    ? arr.subarray(0, len)
    : new Float32Array(arr.buffer, arr.byteOffset, len);
}

/**
 * Compact attribute pack for active indices (sparse write, partial).
 */
export function compactHoloBuffers(views, indices) {
  const n = indices.length;
  const position = new Float32Array(n * 3);
  const entanglementDensity = new Float32Array(n);
  const entanglementDirection = new Float32Array(n * 3);
  const curvature = new Float32Array(n);
  const entanglementWeight = new Float32Array(n);
  const governance = new Float32Array(n * 4);
  const baseNormal = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = indices[k];
    position[k * 3] = views.position[i * 3];
    position[k * 3 + 1] = views.position[i * 3 + 1];
    position[k * 3 + 2] = views.position[i * 3 + 2];
    entanglementDensity[k] = views.entanglementDensity[i];
    entanglementDirection[k * 3] = views.entanglementDirection[i * 3];
    entanglementDirection[k * 3 + 1] = views.entanglementDirection[i * 3 + 1];
    entanglementDirection[k * 3 + 2] = views.entanglementDirection[i * 3 + 2];
    curvature[k] = views.curvature[i];
    entanglementWeight[k] = views.entanglementWeight[i];
    governance[k * 4] = views.governance[i * 4];
    governance[k * 4 + 1] = views.governance[i * 4 + 1];
    governance[k * 4 + 2] = views.governance[i * 4 + 2];
    governance[k * 4 + 3] = views.governance[i * 4 + 3];
    baseNormal[k * 3] = views.baseNormal[i * 3];
    baseNormal[k * 3 + 1] = views.baseNormal[i * 3 + 1];
    baseNormal[k * 3 + 2] = views.baseNormal[i * 3 + 2];
  }
  return {
    count: n,
    h_ij: views.h_ij,
    position,
    entanglementDensity,
    entanglementDirection,
    curvature,
    entanglementWeight,
    governance,
    baseNormal,
    compacted: true,
    sourceCount: views.count,
  };
}

/**
 * Serialize one frame to a Node Buffer (header + attrs).
 * @param {object} opts
 * @param {object} opts.buffers holoBuffers or views
 * @param {number} opts.t frame index
 * @param {boolean} [opts.sparse=true] compact ρ < vacuumRho
 * @param {number} [opts.vacuumRho]
 */
export function encodeBinFrame({
  buffers,
  t,
  sparse = true,
  vacuumRho = BIN_VACUUM_RHO_DEFAULT,
} = {}) {
  const full = viewsFromHoloBuffers(buffers, buffers.count);
  let pack = full;
  let sparseApplied = false;
  if (sparse && full.count > 0) {
    const idx = activeNodeIndices(full.entanglementDensity, full.count, vacuumRho);
    if (idx.length < full.count) {
      pack = compactHoloBuffers(full, idx);
      sparseApplied = true;
    }
  }
  const header = buildBinHeader(pack.count, t | 0, pack.h_ij);
  const parts = [
    Buffer.from(header),
    typedArrayToBuffer(pack.position),
    typedArrayToBuffer(pack.entanglementDensity),
    typedArrayToBuffer(pack.entanglementDirection),
    typedArrayToBuffer(pack.curvature),
    typedArrayToBuffer(pack.entanglementWeight),
    typedArrayToBuffer(pack.governance),
    typedArrayToBuffer(pack.baseNormal),
  ];
  const buf = Buffer.concat(parts);
  const expected =
    BIN_FRAME_HEADER_BYTES + pack.count * BIN_FLOATS_PER_NODE * 4;
  if (buf.byteLength !== expected) {
    throw new Error(
      `bin frame size mismatch: got ${buf.byteLength}, expected ${expected}`,
    );
  }
  return {
    buffer: buf,
    count: pack.count,
    sourceCount: full.count,
    sparseApplied,
    byteLength: buf.byteLength,
  };
}

/**
 * Write frame-NNNNNN.bin
 */
export function writeBinFrame(filePath, opts) {
  const encoded = encodeBinFrame(opts);
  writeFileSync(filePath, encoded.buffer);
  return encoded;
}

/**
 * Parse header + validate float payload length.
 * @param {Buffer|ArrayBuffer|Uint8Array} data
 */
export function parseBinFrame(data) {
  const src =
    Buffer.isBuffer(data)
      ? data
      : Buffer.from(
          data instanceof ArrayBuffer ? data : data.buffer,
          data.byteOffset || 0,
          data.byteLength ?? data.length,
        );
  if (src.byteLength < BIN_FRAME_HEADER_BYTES) {
    throw new Error("bin frame too short for header");
  }
  // Copy to aligned ArrayBuffer so TypedArray views are safe.
  const ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
  const u32 = new Uint32Array(ab, 0, 2);
  const count = u32[0];
  const t = u32[1];
  const h_ij = Float32Array.from(new Float32Array(ab, 8, 9));
  const expected = BIN_FRAME_HEADER_BYTES + count * BIN_FLOATS_PER_NODE * 4;
  if (ab.byteLength !== expected) {
    throw new Error(
      `bin payload length ${ab.byteLength} != expected ${expected} for count=${count}`,
    );
  }
  let off = BIN_FRAME_HEADER_BYTES;
  const take = (nFloats) => {
    const view = new Float32Array(ab, off, nFloats);
    off += nFloats * 4;
    return Float32Array.from(view);
  };
  return {
    count,
    t,
    h_ij,
    position: take(count * 3),
    entanglementDensity: take(count),
    entanglementDirection: take(count * 3),
    curvature: take(count),
    entanglementWeight: take(count),
    governance: take(count * 4),
    baseNormal: take(count * 3),
    byteLength: ab.byteLength,
    codec: BIN_FRAME_CODEC,
  };
}

/**
 * meta.json payload for a bin recording session.
 */
export function buildBinMeta({
  frameCount,
  maxNodes,
  fps,
  attributes = BIN_FRAME_ATTRIBUTES.map((a) => a.name),
  vacuumRho = BIN_VACUUM_RHO_DEFAULT,
  lastCount = 0,
  maxWrittenCount = 0,
  genWallMs = null,
  genFpsEstimate = null,
  nodeCountFull = null,
  nodeCountSparse = null,
  avgBinBytes = null,
  sparseEnabled = true,
} = {}) {
  return {
    created: new Date().toISOString(),
    frames: frameCount,
    count: lastCount,
    maxWrittenCount,
    maxNodes,
    fps,
    codec: BIN_FRAME_CODEC,
    attributes,
    header: {
      bytes: BIN_FRAME_HEADER_BYTES,
      count: "uint32 @ byte 0 — written/active node count",
      t: "uint32 @ byte 4 — frame index f (not bulk.t)",
      h_ij: "float32[9] @ byte 8 — row-major 3×3; Float32Array(header, 8, 9)",
      pad: "bytes 44–63 zero",
    },
    sparseRhoThreshold: vacuumRho,
    nodeCountFull,
    nodeCountSparse,
    avgBinBytes,
    sparse: {
      enabled: sparseEnabled,
      vacuumRho,
      sparseRhoThreshold: vacuumRho,
      status: BIN_SPARSE_STATUS,
      nodeCountFull,
      nodeCountSparse,
      avgBinBytes,
      note:
        "Pre-induced cull (ρ/K/w/joints) + write compact; bone/joint keep policy; full EGT kept for walk",
    },
    status: {
      binStreaming: BIN_FRAME_STATUS,
      sparseRho: BIN_SPARSE_STATUS,
      gpuThreeRaster: "declared",
      photoreal: false,
      claim: "partial boundary density, not photoreal",
    },
    genWallMs,
    genFpsEstimate,
    note: "Open watch.html for shader fps overlay — do not invent 60fps without measuring on device",
  };
}
