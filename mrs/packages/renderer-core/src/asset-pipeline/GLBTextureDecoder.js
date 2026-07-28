/**
 * GLBTextureDecoder — decode PNG and JPEG images from GLB binary buffers.
 *
 * Pure-JS PNG decoder using Node.js zlib for DEFLATE decompression.
 * JPEG fallback uses the `canvas` package (already a dependency).
 * No additional npm dependencies required.
 *
 * Status: **implemented**
 */

import { inflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// PNG decoder
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const PNG_FILTER_NONE = 0;
const PNG_FILTER_SUB = 1;
const PNG_FILTER_UP = 2;
const PNG_FILTER_AVG = 3;
const PNG_FILTER_PAETH = 4;

function readU32BE(buf, offset) {
  return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}

function paethPredict(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parsePngChunks(data) {
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = readU32BE(data, offset);
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
    const chunkData = data.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data: chunkData });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function decodePng(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.length < 8) throw new Error("PNG data too short");
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Invalid PNG signature");
  }

  const chunks = parsePngChunks(bytes);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG missing IHDR chunk");

  const dv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = dv.getUint32(0, false);
  const height = dv.getUint32(4, false);
  const bitDepth = dv.getUint8(8);
  const colorType = dv.getUint8(9);

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth} (only 8-bit supported)`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const bytesPerPixel = channels;

  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  if (idatChunks.length === 0) throw new Error("PNG missing IDAT chunk");

  let totalLength = 0;
  for (const chunk of idatChunks) totalLength += chunk.data.length;
  const compressed = new Uint8Array(totalLength);
  let compOffset = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk.data, compOffset);
    compOffset += chunk.data.length;
  }

  const raw = inflateSync(compressed);

  const stride = width * bytesPerPixel;
  const rawData = new Uint8Array(width * height * channels);
  const prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    const filter = raw[rowOffset];
    const row = raw.subarray(rowOffset + 1, rowOffset + 1 + stride);
    const outRow = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const rawVal = row[x];
      const a = x >= bytesPerPixel ? outRow[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = (x >= bytesPerPixel) ? prevRow[x - bytesPerPixel] : 0;

      switch (filter) {
        case PNG_FILTER_NONE: outRow[x] = rawVal; break;
        case PNG_FILTER_SUB: outRow[x] = (rawVal + a) & 0xff; break;
        case PNG_FILTER_UP: outRow[x] = (rawVal + b) & 0xff; break;
        case PNG_FILTER_AVG: outRow[x] = (rawVal + ((a + b) >> 1)) & 0xff; break;
        case PNG_FILTER_PAETH: outRow[x] = (rawVal + paethPredict(a, b, c)) & 0xff; break;
        default: outRow[x] = rawVal; break;
      }
    }

    prevRow.set(outRow);

    const base = y * width * channels;
    for (let px = 0; px < width; px++) {
      for (let ch = 0; ch < channels; ch++) {
        rawData[base + px * channels + ch] = outRow[px * bytesPerPixel + ch];
      }
    }
  }

  let rgba;
  if (channels === 4) {
    rgba = rawData;
  } else if (channels === 3) {
    rgba = new Uint8Array(width * height * 4);
    for (let i = 0, j = 0; i < rawData.length; i += 3) {
      rgba[j++] = rawData[i];
      rgba[j++] = rawData[i + 1];
      rgba[j++] = rawData[i + 2];
      rgba[j++] = 255;
    }
  } else if (channels === 2) {
    rgba = new Uint8Array(width * height * 4);
    for (let i = 0, j = 0; i < rawData.length; i += 2) {
      rgba[j++] = rawData[i];
      rgba[j++] = rawData[i];
      rgba[j++] = rawData[i];
      rgba[j++] = rawData[i + 1];
    }
  } else {
    rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = rawData[i];
      rgba[i * 4 + 1] = rawData[i];
      rgba[i * 4 + 2] = rawData[i];
      rgba[i * 4 + 3] = 255;
    }
  }

  return { width, height, data: rgba };
}

// ---------------------------------------------------------------------------
// JPEG decoder — uses canvas package if available, otherwise throws
// ---------------------------------------------------------------------------

let canvasImageClass = null;
try {
  const canvasMod = await import("canvas");
  canvasImageClass = canvasMod.Image ?? canvasMod.default?.Image;
} catch {
  canvasImageClass = null;
}

function decodeJpeg(buffer) {
  if (!canvasImageClass) {
    throw new Error(
      "JPEG decoding requires the 'canvas' npm package. " +
      "Install it or convert textures to PNG for pure-JS decoding."
    );
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return new Promise((resolve, reject) => {
    const img = new canvasImageClass();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const canvasMod = canvasImageClass;
      let cvs;
      try {
        const { createCanvas } = canvasMod;
        cvs = createCanvas(w, h);
      } catch {
        reject(new Error("canvas.createCanvas not available"));
        return;
      }
      const ctx = cvs.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      resolve({ width: w, height: h, data: new Uint8Array(imageData.data) });
    };
    img.onerror = (err) => reject(new Error(`JPEG decode failed: ${err}`));
    img.src = buf;
  });
}

// ---------------------------------------------------------------------------
// Main decoder — dispatches by mimeType
// ---------------------------------------------------------------------------

/**
 * Decode an image embedded in a GLB binary buffer.
 *
 * @param {object} gltf - Parsed glTF JSON.
 * @param {Uint8Array[]} bins - Array of BIN chunks from the GLB.
 * @param {number} imageIndex - Index into gltf.images.
 * @returns {Promise<{ width: number, height: number, data: Uint8Array }>}
 */
export async function decodeGlbTextureImage(gltf, bins, imageIndex) {
  const image = gltf.images?.[imageIndex];
  if (!image) throw new Error(`Missing glTF image at index ${imageIndex}`);

  let byteOffset = 0;
  let byteLength = 0;
  let binChunk;

  if (image.bufferView != null) {
    const bufferView = gltf.bufferViews?.[image.bufferView];
    if (!bufferView) throw new Error(`Missing bufferView ${image.bufferView} for image ${imageIndex}`);
    const bufferIndex = bufferView.buffer ?? 0;
    if (bufferIndex === 0) {
      binChunk = bins[0];
    } else if (bins[bufferIndex]) {
      binChunk = bins[bufferIndex];
    } else {
      throw new Error(`Image ${imageIndex} references buffer ${bufferIndex} which is not available`);
    }
    byteOffset = bufferView.byteOffset ?? 0;
    byteLength = bufferView.byteLength;
  } else if (image.uri) {
    throw new Error(`Image ${imageIndex} uses a URI which is not supported in GLB binary format`);
  } else {
    throw new Error(`Image ${imageIndex} has no bufferView or URI`);
  }

  const slice = binChunk.subarray(byteOffset, byteOffset + byteLength);

  const mimeType = image.mimeType ?? "image/png";

  if (mimeType === "image/png") {
    return decodePng(slice);
  }
  if (mimeType === "image/jpeg") {
    return decodeJpeg(slice);
  }

  throw new Error(`Unsupported GLB image mimeType: ${mimeType}`);
}
