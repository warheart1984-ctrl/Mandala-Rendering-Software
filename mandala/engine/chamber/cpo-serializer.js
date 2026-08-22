// mandala/engine/chamber/cpo-serializer.js
// CPO/CPF-4D Serialization — convert holoBuffers and binFrames to canonical objects

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
  CPO_VERSION,
  CPO_PROTOCOL,
  CPO_LEVELS,
  CPO_LEVEL_SIZES,
  ENCODING_TYPES,
  PALETTE_TYPES,
  canonicalJSON,
  encodeRLE,
  buildPalette,
  remapToIndices,
  sha256,
} from "./cpo-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CPO_SERIALIZER_STATUS = "skeleton";
export const CPO_SERIALIZER_CLAIM = "CPO/CPF-4D serialization for holoBuffers and binFrames — deterministic, hashable, multiresolution";

/**
 * Quantize float32 field to 8-bit palette indices
 * @param {Float32Array} field
 * @param {number} levels - quantization levels (default 256)
 * @returns {Object} { indices: Uint8Array, min, max, palette: number[] }
 */
export function quantizeField(field, levels = 256) {
  if (!field || !field.length) return { indices: new Uint8Array(0), min: 0, max: 0, palette: [] };
  let min = Infinity, max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const indices = new Uint8Array(field.length);
  const palette = new Array(levels);
  for (let i = 0; i < field.length; i++) {
    const normalized = (field[i] - min) / range;
    const idx = Math.min(levels - 1, Math.max(0, Math.floor(normalized * levels)));
    indices[i] = idx;
  }
  for (let i = 0; i < levels; i++) {
    palette[i] = min + (i + 0.5) / levels * range;
  }
  return { indices, min, max, palette };
}

/**
 * Downsample grid to target resolution using max pooling (preserves peaks)
 * @param {Uint8Array} src - source grid (flat, row-major)
 * @param {number} srcW - source width
 * @param {number} srcH - source height
 * @param {number} dstW - dest width
 * @param {number} dstH - dest height
 * @returns {Uint8Array}
 */
export function downsampleGrid(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.floor(x * scaleX);
      const sx1 = Math.min(srcW - 1, Math.floor((x + 1) * scaleX));
      const sy0 = Math.floor(y * scaleY);
      const sy1 = Math.min(srcH - 1, Math.floor((y + 1) * scaleY));
      let maxVal = 0;
      for (let sy = sy0; sy <= sy1; sy++) {
        const row = sy * srcW;
        for (let sx = sx0; sx <= sx1; sx++) {
          const v = src[row + sx];
          if (v > maxVal) maxVal = v;
        }
      }
      dst[y * dstW + x] = maxVal;
    }
  }
  return dst;
}

/**
 * Extract crop region from grid at full resolution
 * @param {Uint8Array} src
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} x - normalized [0,1]
 * @param {number} y - normalized [0,1]
 * @param {number} w - normalized [0,1]
 * @param {number} h - normalized [0,1]
 * @param {number} dstW
 * @param {number} dstH
 * @returns {Uint8Array}
 */
export function cropGrid(src, srcW, srcH, x, y, w, h, dstW, dstH) {
  const sx0 = Math.floor(x * srcW);
  const sy0 = Math.floor(y * srcH);
  const sw = Math.max(1, Math.floor(w * srcW));
  const sh = Math.max(1, Math.floor(h * srcH));
  const sx1 = Math.min(srcW, sx0 + sw);
  const sy1 = Math.min(srcH, sy0 + sh);
  const cropW = sx1 - sx0;
  const cropH = sy1 - sy0;
  const dst = new Uint8Array(dstW * dstH);
  for (let dy = 0; dy < dstH; dy++) {
    const sy = sy0 + Math.floor(dy * cropH / dstH);
    for (let dx = 0; dx < dstW; dx++) {
      const sx = sx0 + Math.floor(dx * cropW / dstW);
      dst[dy * dstW + dx] = src[sy * srcW + sx];
    }
  }
  return dst;
}

/**
 * Serialize holoBuffers to CPO at a specific level
 * @param {Object} holoBuffers - renderer.holoBuffers
 * @param {number} level - CPO_LEVELS
 * @param {Object} options
 * @param {string} options.field - which field to encode: "entanglementDensity" | "curvature" | "governance" | "position"
 * @param {number} options.frameIndex
 * @param {Object} options.provenance - renderIdentity, etc.
 * @returns {Promise<Object>} CPO
 */
export async function serializeHoloBuffersToCPO(holoBuffers, level, options = {}) {
  const {
    field = "entanglementDensity",
    frameIndex = 0,
    provenance = {},
  } = options;

  const levelSize = CPO_LEVEL_SIZES[level] || CPO_LEVEL_SIZES[CPO_LEVELS.NORMAL];
  const { width, height } = levelSize;
  const count = holoBuffers.count || 0;

  if (count === 0) {
    // Empty frame
    const emptyGrid = new Uint8Array(width * height);
    const palette = { type: PALETTE_TYPES.INDEXED, entries: { 0: [0, 0, 0, 255] }, hash: await sha256({ type: PALETTE_TYPES.INDEXED, entries: { 0: [0, 0, 0, 255] } }) };
    const grid = { encoding: ENCODING_TYPES.RLE_V1, data: encodeRLE(emptyGrid), width, height, hash: await sha256({ encoding: ENCODING_TYPES.RLE_V1, data: encodeRLE(emptyGrid), width, height }) };
    return buildCPO({ width, height, palette, grid, level, frameIndex, provenance, field });
  }

  // Get source field data
  const srcField = holoBuffers[field];
  if (!srcField) {
    throw new Error(`Field ${field} not found in holoBuffers`);
  }

  // Determine source resolution from buffer layout
  // holoBuffers are typically laid out for maxNodes (8192) but only count are active
  // We need to infer a 2D layout. For now, assume roughly square.
  const srcCount = count;
  const srcDim = Math.ceil(Math.sqrt(srcCount));
  const srcW = srcDim;
  const srcH = srcDim;

  // Quantize to 8-bit
  const srcData = srcField.subarray ? srcField.subarray(0, srcCount) : srcField.slice(0, srcCount);
  const { indices: quantized } = quantizeField(srcData, 256);

  // Build source grid (pad to square)
  const srcGrid = new Uint8Array(srcW * srcH);
  for (let i = 0; i < srcCount; i++) {
    const y = Math.floor(i / srcW);
    const x = i % srcW;
    if (y < srcH) srcGrid[y * srcW + x] = quantized[i];
  }

  // Downsample to target level
  const levelGrid = downsampleGrid(srcGrid, srcW, srcH, width, height);

  // Build palette and remap
  const palette = buildPalette(levelGrid);
  const valueToIndex = {};
  for (const [idx, entry] of Object.entries(palette.entries)) {
    valueToIndex[entry[0]] = parseInt(idx, 10);
  }
  const indexedGrid = remapToIndices(levelGrid, valueToIndex);

  // Encode grid
  const rleData = encodeRLE(indexedGrid);
  const grid = {
    encoding: ENCODING_TYPES.RLE_V1,
    data: rleData,
    width,
    height,
    hash: await sha256({ encoding: ENCODING_TYPES.RLE_V1, data: rleData, width, height }),
  };

  return buildCPO({ width, height, palette, grid, level, frameIndex, provenance, field });
}

/**
 * Build full CPO object with metadata
 */
async function buildCPO({ width, height, palette, grid, level, frameIndex, provenance, field }) {
  const payload = {
    width,
    height,
    palette,
    grid,
    level,
    field,
  };

  const payloadCanonical = canonicalJSON(payload);
  const payloadHash = await sha256(payloadCanonical);

  const cpo = {
    protocol: CPO_PROTOCOL,
    version: CPO_VERSION,
    type: "image",
    subtype: "canonical-indexed-grid",
    payload,
    payload_hash: payloadHash,
    metadata: {
      created: new Date().toISOString(),
      source: "holo-chamber",
      provenance: {
        frameIndex,
        field,
        ...provenance,
      },
    },
  };

  const cpoCanonical = canonicalJSON(cpo);
  cpo.metadata.content_hash = await sha256(cpoCanonical);

  return cpo;
}

/**
 * Build multiresolution CPO pyramid (all levels)
 * @param {Object} holoBuffers
 * @param {Object} options
 * @returns {Promise<Object>} CPO with tiles for each level
 */
export async function buildCPOPyramid(holoBuffers, options = {}) {
  const baseCPO = await serializeHoloBuffersToCPO(holoBuffers, CPO_LEVELS.NORMAL, options);

  // Generate tiles for each level
  const tiles = {};
  for (const [levelName, level] of Object.entries(CPO_LEVELS)) {
    if (level === CPO_LEVELS.CROP) continue; // CROP is on-demand
    const levelCPO = await serializeHoloBuffersToCPO(holoBuffers, level, options);
    tiles[levelName] = {
      level,
      width: levelCPO.payload.width,
      height: levelCPO.payload.height,
      grid_hash: levelCPO.payload.grid.hash,
      payload_hash: levelCPO.payload_hash,
    };
  }

  baseCPO.payload.tiles = tiles;
  baseCPO.payload.pyramid = true;

  // G6: Serialize governance field through CPO pyramid
  if (holoBuffers.governance) {
    try {
      const govCPO = await serializeHoloBuffersToCPO(holoBuffers, CPO_LEVELS.NORMAL, {
        ...options,
        field: "governance",
      });
      baseCPO.payload.governance_grid = {
        width: govCPO.payload.width,
        height: govCPO.payload.height,
        grid_hash: govCPO.payload.grid.hash,
        payload_hash: govCPO.payload_hash,
        field: "governance",
        components: 4,
        note: "CIEMS governance vec4 [intent, evidence, conformance, stewardship] quantized to 8-bit per component",
      };
    } catch (govErr) {
      // Governance serialization is best-effort; don't fail the whole pyramid
      baseCPO.payload.governance_grid = { error: govErr.message };
    }
  }

  // Recompute hashes
  const payloadCanonical = canonicalJSON(baseCPO.payload);
  baseCPO.payload_hash = await sha256(payloadCanonical);
  const cpoCanonical = canonicalJSON(baseCPO);
  baseCPO.metadata.content_hash = await sha256(cpoCanonical);

  return baseCPO;
}

/**
 * Extract crop region at CROP level (256×256)
 * @param {Object} holoBuffers
 * @param {Object} bbox - normalized {x, y, width, height}
 * @param {Object} options
 * @returns {Promise<Object>} CPO tile at CROP level
 */
export async function extractCPOCrop(holoBuffers, bbox, options = {}) {
  const { frameIndex = 0, provenance = {}, field = "entanglementDensity" } = options;
  const level = CPO_LEVELS.CROP;
  const { width, height } = CPO_LEVEL_SIZES[level];

  const count = holoBuffers.count || 0;
  if (count === 0) {
    return buildCPO({ width, height, palette: { type: PALETTE_TYPES.INDEXED, entries: { 0: [0,0,0,255] }, hash: "" }, grid: { encoding: ENCODING_TYPES.RLE_V1, data: "", width, height, hash: "" }, level, frameIndex, provenance, field });
  }

  // Get source field and quantize
  const srcField = holoBuffers[field];
  const srcData = srcField.subarray ? srcField.subarray(0, count) : srcField.slice(0, count);
  const { indices: quantized } = quantizeField(srcData, 256);

  // Infer source 2D layout
  const srcDim = Math.ceil(Math.sqrt(count));
  const srcW = srcDim;
  const srcH = srcDim;
  const srcGrid = new Uint8Array(srcW * srcH);
  for (let i = 0; i < count; i++) {
    const y = Math.floor(i / srcW);
    const x = i % srcW;
    if (y < srcH) srcGrid[y * srcW + x] = quantized[i];
  }

  // Crop to region
  const cropGridData = cropGrid(srcGrid, srcW, srcH, bbox.x, bbox.y, bbox.width, bbox.height, width, height);

  // Build palette and encode
  const palette = buildPalette(cropGridData);
  const valueToIndex = {};
  for (const [idx, entry] of Object.entries(palette.entries)) {
    valueToIndex[entry[0]] = parseInt(idx, 10);
  }
  const indexedGrid = remapToIndices(cropGridData, valueToIndex);
  const rleData = encodeRLE(indexedGrid);
  const grid = {
    encoding: ENCODING_TYPES.RLE_V1,
    data: rleData,
    width,
    height,
    hash: await sha256({ encoding: ENCODING_TYPES.RLE_V1, data: rleData, width, height }),
  };

  const cropCPO = await buildCPO({ width, height, palette, grid, level, frameIndex, provenance, field });
  cropCPO.payload.crop = { source_bbox: bbox };
  return cropCPO;
}

/**
 * Serialize binFrame to CPF-4D (field representation)
 * @param {Object} binFrame - parsed binFrame
 * @param {Object} options
 * @returns {Promise<Object>} CPF-4D
 */
export async function serializeBinFrameToCPF4D(binFrame, options = {}) {
  const { frameIndex = 0, provenance = {} } = options;

  const fields = {};
  const fieldNames = ["position", "entanglementDensity", "entanglementDirection", "curvature", "entanglementWeight", "governance", "baseNormal"];

  for (const name of fieldNames) {
    const data = binFrame[name];
    if (!data || !data.length) continue;
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const hash = "sha256:" + createHash("sha256").update(buffer).digest("hex");
    fields[name] = {
      encoding: "float32-le",
      data: buffer.toString("base64"),
      hash,
      components: name === "position" || name === "entanglementDirection" || name === "baseNormal" ? 3 : name === "governance" ? 4 : 1,
    };
  }

  const payload = {
    nx: Math.ceil(Math.cbrt(binFrame.count || 1)),
    ny: Math.ceil(Math.cbrt(binFrame.count || 1)),
    nz: Math.ceil(Math.cbrt(binFrame.count || 1)),
    nt: 1,
    fields,
  };

  const payloadCanonical = canonicalJSON(payload);
  const payloadHash = await sha256(payloadCanonical);

  const cpf4d = {
    protocol: CPO_PROTOCOL,
    version: CPO_VERSION,
    type: "field-4d",
    subtype: "canonical-float-field",
    payload,
    payload_hash: payloadHash,
    metadata: {
      created: new Date().toISOString(),
      source: "holo-chamber",
      provenance: { frameIndex, ...provenance },
    },
  };

  cpf4d.metadata.content_hash = await sha256(canonicalJSON(cpf4d));
  return cpf4d;
}

/**
 * Write CPO to file
 */
export async function writeCPO(outDir, frameIndex, cpo) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const cpoDir = join(outDir, "cpo");
  mkdirSync(cpoDir, { recursive: true });
  const path = join(cpoDir, `frame-${String(frameIndex).padStart(6, "0")}.cpo.json`);
  writeFileSync(path, canonicalJSON(cpo));
  return path;
}

/**
 * Write SPO to file
 */
export async function writeSPO(outDir, frameIndex, spo) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const spoDir = join(outDir, "spo");
  mkdirSync(spoDir, { recursive: true });
  const path = join(spoDir, `frame-${String(frameIndex).padStart(6, "0")}.spo.json`);
  writeFileSync(path, canonicalJSON(spo));
  return path;
}

/**
 * Write CPF-4D to file
 */
export async function writeCPF4D(outDir, frameIndex, cpf4d) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const cpfDir = join(outDir, "cpf4d");
  mkdirSync(cpfDir, { recursive: true });
  const path = join(cpfDir, `frame-${String(frameIndex).padStart(6, "0")}.cpf4d.json`);
  writeFileSync(path, canonicalJSON(cpf4d));
  return path;
}