// mandala/engine/chamber/cpo-types.js
// Canonical Pixel Object (CPO) & Semantic Perception Object (SPO) types
// Deterministic, hashable, multiresolution visual primitives

import { createHash } from "node:crypto";

export const CPO_VERSION = "1.0.0";
export const CPO_PROTOCOL = "mandala-link/1";

export const ENCODING_TYPES = Object.freeze({
  RLE_V1: "rle-v1",
  RAW_V1: "raw-v1",
});

export const PALETTE_TYPES = Object.freeze({
  RGBA8: "rgba8",
  INDEXED: "indexed",
  FLOAT32: "float32",
});

export const CPO_LEVELS = Object.freeze({
  GLOBAL: 0,    // 8×8
  ROUGH: 1,     // 16×16
  NORMAL: 2,    // 32×32
  DETAIL: 3,    // 64×64
  CROP: 4,      // 256×256 (targeted only)
});

export const CPO_LEVEL_SIZES = Object.freeze({
  [CPO_LEVELS.GLOBAL]: { width: 8, height: 8 },
  [CPO_LEVELS.ROUGH]: { width: 16, height: 16 },
  [CPO_LEVELS.NORMAL]: { width: 32, height: 32 },
  [CPO_LEVELS.DETAIL]: { width: 64, height: 64 },
  [CPO_LEVELS.CROP]: { width: 256, height: 256 },
});

/**
 * CPO Palette - deterministic color/value mapping
 * @typedef {Object} CPOPalette
 * @property {string} type - PALETTE_TYPES
 * @property {Object<number, number[]>} entries - index -> [r,g,b,a] or [value]
 * @property {string} hash - sha256 of canonical palette serialization
 */

/**
 * CPO Grid - encoded pixel data
 * @typedef {Object} CPOGrid
 * @property {string} encoding - ENCODING_TYPES
 * @property {string} data - RLE or raw encoded data
 * @property {number} width
 * @property {number} height
 * @property {string} hash - sha256 of canonical grid serialization
 */

/**
 * CPO Tile - single resolution tile
 * @typedef {Object} CPOTile
 * @property {number} level - CPO_LEVELS
 * @property {number} x - tile x coordinate (in tiles at this level)
 * @property {number} y - tile y coordinate
 * @property {CPOGrid} grid
 */

/**
 * Canonical Pixel Object
 * @typedef {Object} CPO
 * @property {string} protocol - CPO_PROTOCOL
 * @property {string} version - CPO_VERSION
 * @property {string} type - "image" | "field" | "depth" | "segmentation" | "motion"
 * @property {string} subtype - e.g., "canonical-indexed-grid", "canonical-float-field"
 * @property {Object} payload
 * @property {number} payload.width
 * @property {number} payload.height
 * @property {CPOPalette} payload.palette
 * @property {CPOGrid} payload.grid
 * @property {number} payload.level - base level (usually NORMAL=2)
 * @property {Object} [payload.tiles] - multiresolution tiles by level
 * @property {string} payload_hash - sha256 of canonical payload
 * @property {Object} metadata
 * @property {string} metadata.created
 * @property {string} metadata.source - "holo-chamber" | "renderer" | "simulation"
 * @property {Object} metadata.provenance - renderIdentity, frameIndex, etc.
 * @property {string} metadata.content_hash - sha256 of entire CPO (for integrity)
 */

/**
 * Semantic Perception Object
 * @typedef {Object} SPO
 * @property {string} protocol - CPO_PROTOCOL
 * @property {string} version - CPO_VERSION
 * @property {string} type - "semantic-overlay"
 * @property {string} source_hash - sha256 of parent CPO
 * @property {Object[]} regions
 * @property {number} regions[].region_id - corresponds to CPO palette index or segment
 * @property {string} regions[].label - semantic label
 * @property {number} regions[].confidence - [0,1]
 * @property {number[]} regions[].bbox - [x, y, width, height] in CPO coordinates
 * @property {string} regions[].evidence_ref - reference to observation evidence
 * @property {Object} provider
 * @property {string} provider.name - "mandala-perception-v1" | "openai-vision" | "qwen-vl" | "llava"
 * @property {string} provider.version
 * @property {Object} provider.config - detail level, question, etc.
 * @property {Object} governance
 * @property {number} governance.intent_confidence
 * @property {number} governance.evidence_confidence
 * @property {number} governance.conformance_score
 * @property {number} governance.stewardship_score
 * @property {string} metadata.created
 * @property {string} metadata.content_hash
 */

/**
 * CPF-4D Field - extends CPO to 4D coordinate space
 * @typedef {Object} CPF4D
 * @property {string} protocol - CPO_PROTOCOL
 * @property {string} version - CPO_VERSION
 * @property {string} type - "field-4d"
 * @property {Object} payload
 * @property {number} payload.nx - spatial X resolution
 * @property {number} payload.ny - spatial Y resolution
 * @property {number} payload.nz - spatial Z resolution
 * @property {number} payload.nt - temporal resolution
 * @property {Object} payload.fields - field name -> { encoding, data, hash }
 * @property {string} payload_hash
 * @property {Object} metadata
 * @property {string} metadata.source - "bulk-spacetime" | "holo-chamber"
 * @property {Object} metadata.provenance
 */

/**
 * Compute SHA256 hash of string/buffer
 */
export async function sha256(data) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else if (typeof data === "string") {
    hash.update(data);
  } else {
    hash.update(JSON.stringify(data));
  }
  return "sha256:" + hash.digest("hex");
}

/**
 * Canonical JSON serialization - deterministic key ordering
 */
export function canonicalJSON(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJSON).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
}

/**
 * RLE encoding for indexed grids
 * @param {Uint8Array|number[]} flatGrid - row-major flat array
 * @returns {string} RLE string "count:index,count:index,..."
 */
export function encodeRLE(flatGrid) {
  if (!flatGrid.length) return "";
  const result = [];
  let current = flatGrid[0];
  let count = 1;
  for (let i = 1; i < flatGrid.length; i++) {
    if (flatGrid[i] === current && count < 65535) {
      count++;
    } else {
      result.push(`${count}:${current}`);
      current = flatGrid[i];
      count = 1;
    }
  }
  result.push(`${count}:${current}`);
  return result.join(",");
}

/**
 * RLE decoding
 * @param {string} rleString
 * @param {number} expectedLength
 * @returns {Uint8Array}
 */
export function decodeRLE(rleString, expectedLength) {
  if (!rleString) return new Uint8Array(expectedLength);
  const parts = rleString.split(",");
  const result = new Uint8Array(expectedLength);
  let idx = 0;
  for (const part of parts) {
    const [countStr, valueStr] = part.split(":");
    const count = parseInt(countStr, 10);
    const value = parseInt(valueStr, 10);
    for (let i = 0; i < count; i++) {
      if (idx >= expectedLength) break;
      result[idx++] = value;
    }
  }
  return result;
}

/**
 * Build deterministic palette from unique values
 * @param {Uint8Array|number[]} flatGrid
 * @returns {CPOPalette}
 */
export function buildPalette(flatGrid) {
  const unique = [...new Set(flatGrid)].sort((a, b) => a - b);
  const entries = {};
  unique.forEach((val, idx) => {
    entries[idx] = [val, val, val, 255]; // grayscale palette for indexed
  });
  const canonical = canonicalJSON({ type: PALETTE_TYPES.INDEXED, entries });
  const hash = "sha256:" + createHash("sha256").update(canonical).digest("hex");
  return { type: PALETTE_TYPES.INDEXED, entries, hash };
}

/**
 * Remap grid values to palette indices
 * @param {Uint8Array|number[]} flatGrid
 * @param {Object<number, number>} valueToIndex
 * @returns {Uint8Array}
 */
export function remapToIndices(flatGrid, valueToIndex) {
  const result = new Uint8Array(flatGrid.length);
  for (let i = 0; i < flatGrid.length; i++) {
    result[i] = valueToIndex[flatGrid[i]] ?? 0;
  }
  return result;
}