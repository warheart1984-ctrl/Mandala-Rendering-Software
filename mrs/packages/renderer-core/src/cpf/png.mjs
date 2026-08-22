/**
 * png.mjs — self-contained, deterministic RGBA PNG encode + decode for the
 * Canonical Perceptual Field (CPF) layer.
 *
 * WHY A LOCAL COPY: the repo already has a PNG encoder in
 * `scripts/render-still.mjs` (`encodePNG`) and a decoder in
 * `mandala/engine/png.mjs` (`decodePngToRgb`). The encoder is only reachable by
 * importing the whole RT4D path tracer, and the decoder drops the alpha channel
 * (returns RGB888). The CPO codec needs an *alpha-preserving* round-trip with no
 * heavy dependencies, so this module carries a minimal RGBA encoder (filter 0)
 * and a full decoder (filters 0–4) that keeps alpha. The byte layout matches the
 * existing encoders (8-bit, color type 6, deflate) so output is interchangeable.
 *
 * Determinism: pure function of the input bytes. No Math.random, no Date.now.
 */
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode RGBA8 pixels to a PNG buffer (color type 6, filter 0, deflate level 9).
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Buffer} rgba length must be width*height*4
 * @returns {Buffer}
 */
export function encodeRgbaPng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodeRgbaPng: rgba length ${rgba.length} != ${width * height * 4}`);
  }
  const src = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterRow(filter, row, prev, bpp) {
  const n = row.length;
  if (filter === 0) return;
  for (let i = 0; i < n; i++) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = prev[i];
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    let recon = row[i];
    if (filter === 1) recon += left;
    else if (filter === 2) recon += up;
    else if (filter === 3) recon += (left + up) >> 1;
    else if (filter === 4) recon += paeth(left, up, upLeft);
    else throw new Error(`unsupported PNG filter ${filter}`);
    row[i] = recon & 255;
  }
}

/**
 * Decode an 8-bit gray/RGB/RGBA PNG to RGBA8, preserving alpha.
 * Gray and RGB inputs get alpha=255. Throws on unsupported formats.
 * @param {Buffer|Uint8Array} buf
 * @returns {{ width:number, height:number, rgba:Buffer }}
 */
export function decodePngToRgba(buf) {
  const png = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (png.length < 24 || png[0] !== 0x89 || png[1] !== 0x50) {
    throw new Error("decodePngToRgba: not a PNG");
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 0 && colorType !== 2 && colorType !== 6)) {
    throw new Error(`decodePngToRgba: unsupported PNG depth=${bitDepth} color=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const inflated = inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    inflated.copy(row, 0, src, src + stride);
    src += stride;
    unfilterRow(filter, row, prev, bpp);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 0) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = row[x];
        rgba[o + 3] = 255;
      } else if (colorType === 2) {
        rgba[o] = row[x * 3];
        rgba[o + 1] = row[x * 3 + 1];
        rgba[o + 2] = row[x * 3 + 2];
        rgba[o + 3] = 255;
      } else {
        rgba[o] = row[x * 4];
        rgba[o + 1] = row[x * 4 + 1];
        rgba[o + 2] = row[x * 4 + 2];
        rgba[o + 3] = row[x * 4 + 3];
      }
    }
    row.copy(prev);
  }
  return { width, height, rgba };
}
