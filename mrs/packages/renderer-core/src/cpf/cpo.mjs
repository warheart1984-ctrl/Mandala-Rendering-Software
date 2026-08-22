/**
 * cpo.mjs — Canonical Pixel Object (CPO) codec + `mandala-link/1` packet.
 *
 * The CPO is the first experimental component of the Canonical Perceptual Field
 * (CPF) layer. It is a *measurement*, not a perception: raw RGBA is losslessly
 * re-expressed as a canonical, byte-deterministic, hashable object that any host
 * can reproduce and verify. There is NO neural model here — the CPO is pure,
 * replayable arithmetic over pixels.
 *
 * ── PALETTE ORDERING RULE (canonical) ────────────────────────────────────────
 *   The palette is the SET of distinct RGBA colors in the image, sorted ascending
 *   by the 32-bit key (R<<24)|(G<<16)|(B<<8)|A. This ordering is a pure function
 *   of the color *set* (independent of pixel layout), so two images with the same
 *   colors always produce the same palette and the same `palette_hash`. Each pixel
 *   is assigned the index of its color within this sorted palette.
 *
 * ── INDEX STREAM ─────────────────────────────────────────────────────────────
 *   The grid is the row-major (y-major, x-minor) sequence of palette indices,
 *   length = width*height.
 *
 * ── RLE GRAMMAR (`rle-v1`) ───────────────────────────────────────────────────
 *   grid   := run ("," run)*
 *   run    := count ":" index
 *   count  := positive decimal integer (>= 1), the run length
 *   index  := non-negative decimal integer, the palette index for the run
 *   Runs are maximal: consecutive equal indices are merged into one run. The sum
 *   of all counts equals width*height. An empty image (0 pixels) encodes as "".
 *   Example: "3:0,2:1,10:0" = three index-0, two index-1, ten index-0.
 *
 * ── HASHES (all lowercase hex sha256) ────────────────────────────────────────
 *   palette_hash = sha256(canonical palette bytes: N entries * 4 bytes RGBA)
 *   grid_hash    = sha256(utf8(RLE string))
 *   payload_hash = sha256(utf8(canonical payload digest input, see PAYLOAD_DIGEST))
 *   The provenance.source_hash = "sha256:" + sha256(raw input RGBA bytes).
 *
 * Determinism: same input bytes -> identical packet + identical hashes, on every
 * run and platform. No Math.random, no Date.now.
 */
import { createHash } from "node:crypto";

import { decodePngToRgba, encodeRgbaPng } from "./png.mjs";

export const CPO_ENCODER_VERSION = "1.0.0";
export const MANDALA_LINK_PROTOCOL = "mandala-link/1";
export const CPO_SUBTYPE = "canonical-indexed-grid";
export const CPO_ENCODING = "rle-v1";

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Build the canonical palette (sorted distinct RGBA colors) and a color->index map.
 * @param {Buffer|Uint8Array} rgba
 * @returns {{ palette:number[][], indexOf:Map<number,number> }}
 */
function buildPalette(rgba) {
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    // key is an unsigned 32-bit color id; >>> 0 keeps it non-negative.
    const key = ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
    seen.add(key);
  }
  const keys = Array.from(seen).sort((a, b) => a - b);
  const palette = new Array(keys.length);
  const indexOf = new Map();
  for (let idx = 0; idx < keys.length; idx++) {
    const key = keys[idx];
    palette[idx] = [(key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255, key & 255];
    indexOf.set(key, idx);
  }
  return { palette, indexOf };
}

/**
 * RLE-v1 encode an array-like of palette indices to the canonical run string.
 * @param {ArrayLike<number>} indices
 * @returns {string}
 */
export function encodeRleV1(indices) {
  const n = indices.length;
  if (n === 0) return "";
  const parts = [];
  let runIndex = indices[0];
  let runCount = 1;
  for (let i = 1; i < n; i++) {
    const v = indices[i];
    if (v === runIndex) {
      runCount++;
    } else {
      parts.push(`${runCount}:${runIndex}`);
      runIndex = v;
      runCount = 1;
    }
  }
  parts.push(`${runCount}:${runIndex}`);
  return parts.join(",");
}

/**
 * RLE-v1 decode a run string back to a flat Int32Array of palette indices.
 * @param {string} rle
 * @returns {Int32Array}
 */
export function decodeRleV1(rle) {
  if (rle === "") return new Int32Array(0);
  const runs = rle.split(",");
  // First pass: total length so we can allocate exactly once.
  let total = 0;
  const parsed = new Array(runs.length);
  for (let r = 0; r < runs.length; r++) {
    const colon = runs[r].indexOf(":");
    if (colon < 0) throw new Error(`decodeRleV1: malformed run "${runs[r]}"`);
    const count = Number(runs[r].slice(0, colon));
    const index = Number(runs[r].slice(colon + 1));
    if (!Number.isInteger(count) || count < 1) throw new Error(`decodeRleV1: bad count in "${runs[r]}"`);
    if (!Number.isInteger(index) || index < 0) throw new Error(`decodeRleV1: bad index in "${runs[r]}"`);
    parsed[r] = [count, index];
    total += count;
  }
  const out = new Int32Array(total);
  let o = 0;
  for (let r = 0; r < parsed.length; r++) {
    const [count, index] = parsed[r];
    out.fill(index, o, o + count);
    o += count;
  }
  return out;
}

/** Canonical digest input for payload_hash. Transitively covers palette + grid. */
function payloadDigestInput(width, height, encoding, paletteHash, gridHash) {
  return `mandala-cpo/1\n${width}\n${height}\n${encoding}\npalette_hash=${paletteHash}\ngrid_hash=${gridHash}\n`;
}

/**
 * Encode raw RGBA pixels into a CPO `mandala-link/1` packet (lossless, indexed).
 * @param {Buffer|Uint8Array} rgba length must be width*height*4
 * @param {number} width
 * @param {number} height
 * @param {{ params?:object }} [opts]
 * @returns {object} the CPO packet
 */
export function encodeCPO(rgba, width, height, opts = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    throw new Error(`encodeCPO: invalid dimensions ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodeCPO: rgba length ${rgba.length} != ${width * height * 4}`);
  }
  const src = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  const sourceHash = sha256Hex(src);

  const { palette, indexOf } = buildPalette(src);

  const pixelCount = width * height;
  const indices = new Int32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const key = ((src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3]) >>> 0;
    indices[p] = indexOf.get(key);
  }

  const grid = encodeRleV1(indices);

  const paletteBytes = Buffer.alloc(palette.length * 4);
  for (let k = 0; k < palette.length; k++) {
    paletteBytes[k * 4] = palette[k][0];
    paletteBytes[k * 4 + 1] = palette[k][1];
    paletteBytes[k * 4 + 2] = palette[k][2];
    paletteBytes[k * 4 + 3] = palette[k][3];
  }
  const paletteHash = sha256Hex(paletteBytes);
  const gridHash = sha256Hex(Buffer.from(grid, "utf8"));
  const payloadHash = sha256Hex(
    Buffer.from(payloadDigestInput(width, height, CPO_ENCODING, paletteHash, gridHash), "utf8"),
  );

  return {
    protocol: MANDALA_LINK_PROTOCOL,
    type: "image",
    subtype: CPO_SUBTYPE,
    payload: {
      width,
      height,
      palette,
      encoding: CPO_ENCODING,
      grid,
      palette_hash: paletteHash,
      grid_hash: gridHash,
    },
    payload_hash: payloadHash,
    provenance: {
      source_hash: `sha256:${sourceHash}`,
      encoder: "mandala-cpf/cpo",
      encoder_version: CPO_ENCODER_VERSION,
      params: { encoding: CPO_ENCODING, palette_order: "sorted-rgba-asc", lossless: true, ...(opts.params ?? {}) },
    },
  };
}

/**
 * Structural + hash validation of a CPO packet. Recomputes palette_hash,
 * grid_hash and payload_hash and checks the run-length total matches width*height.
 * @param {object} packet
 * @returns {{ valid:boolean, errors:string[] }}
 */
export function validateCPO(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object") return { valid: false, errors: ["packet is not an object"] };
  if (packet.protocol !== MANDALA_LINK_PROTOCOL) errors.push(`protocol != ${MANDALA_LINK_PROTOCOL}`);
  if (packet.type !== "image") errors.push('type != "image"');
  if (packet.subtype !== CPO_SUBTYPE) errors.push(`subtype != ${CPO_SUBTYPE}`);
  const p = packet.payload;
  if (!p || typeof p !== "object") {
    errors.push("missing payload");
    return { valid: false, errors };
  }
  if (p.encoding !== CPO_ENCODING) errors.push(`encoding != ${CPO_ENCODING}`);
  if (!Array.isArray(p.palette)) errors.push("palette is not an array");
  if (typeof p.grid !== "string") errors.push("grid is not a string");
  if (errors.length > 0) return { valid: false, errors };

  const paletteBytes = Buffer.alloc(p.palette.length * 4);
  for (let k = 0; k < p.palette.length; k++) {
    const c = p.palette[k];
    if (!Array.isArray(c) || c.length !== 4) {
      errors.push(`palette[${k}] is not [r,g,b,a]`);
      continue;
    }
    paletteBytes[k * 4] = c[0] & 255;
    paletteBytes[k * 4 + 1] = c[1] & 255;
    paletteBytes[k * 4 + 2] = c[2] & 255;
    paletteBytes[k * 4 + 3] = c[3] & 255;
  }
  const paletteHash = sha256Hex(paletteBytes);
  if (paletteHash !== p.palette_hash) errors.push("palette_hash mismatch");

  const gridHash = sha256Hex(Buffer.from(p.grid, "utf8"));
  if (gridHash !== p.grid_hash) errors.push("grid_hash mismatch");

  const payloadHash = sha256Hex(
    Buffer.from(payloadDigestInput(p.width, p.height, p.encoding, paletteHash, gridHash), "utf8"),
  );
  if (payloadHash !== packet.payload_hash) errors.push("payload_hash mismatch");

  let total = 0;
  try {
    total = decodeRleV1(p.grid).length;
  } catch (e) {
    errors.push(`grid decode failed: ${e.message}`);
  }
  if (total !== p.width * p.height) {
    errors.push(`grid length ${total} != width*height ${p.width * p.height}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Decode a CPO packet back to raw RGBA. Round-trip is exact for packets produced
 * by encodeCPO. Set `opts.verify` false to skip hash validation.
 * @param {object} packet
 * @param {{ verify?:boolean }} [opts]
 * @returns {{ width:number, height:number, rgba:Buffer }}
 */
export function decodeCPO(packet, opts = {}) {
  const verify = opts.verify !== false;
  if (verify) {
    const { valid, errors } = validateCPO(packet);
    if (!valid) throw new Error(`decodeCPO: invalid packet: ${errors.join("; ")}`);
  }
  const { width, height, palette, grid } = packet.payload;
  const indices = decodeRleV1(grid);
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < indices.length; p++) {
    const c = palette[indices[p]];
    if (!c) throw new Error(`decodeCPO: index ${indices[p]} out of palette range`);
    const o = p * 4;
    rgba[o] = c[0];
    rgba[o + 1] = c[1];
    rgba[o + 2] = c[2];
    rgba[o + 3] = c[3];
  }
  return { width, height, rgba };
}

/** Convenience: PNG buffer -> CPO packet (lossless when the PNG is within palette). */
export function encodeCPOFromPng(pngBuffer, opts = {}) {
  const { width, height, rgba } = decodePngToRgba(pngBuffer);
  return encodeCPO(rgba, width, height, opts);
}

/** Convenience: CPO packet -> PNG buffer (exact round-trip of pixels). */
export function decodeCPOToPng(packet, opts = {}) {
  const { width, height, rgba } = decodeCPO(packet, opts);
  return encodeRgbaPng(width, height, rgba);
}
