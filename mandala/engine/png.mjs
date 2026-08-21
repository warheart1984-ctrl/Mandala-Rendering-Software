/**
 * Minimal PNG from RGB888. Reuses character encoder (no new dependency).
 * Decode is local (zlib) so SD-Turbo overlays do not need extra packages.
 */
import { inflateSync } from "node:zlib";
import { encodePngRgba } from "../../character/renders/png.mjs";

export function rgbToPng(width, height, rgb) {
  const rgba = new Uint8Array(width * height * 4);
  let o = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    rgba[o++] = rgb[i];
    rgba[o++] = rgb[i + 1];
    rgba[o++] = rgb[i + 2];
    rgba[o++] = 255;
  }
  return encodePngRgba(width, height, rgba);
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

function applyPngFilter(filter, row, prev, bpp) {
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
 * Decode 8-bit gray/RGB/RGBA PNG to RGB888. Throws on JPEG or exotic PNG.
 */
export function decodePngToRgb(buf) {
  const png = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (png.length < 24 || png[0] !== 0x89 || png[1] !== 0x50) {
    throw new Error("not a PNG");
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
    throw new Error(`unsupported PNG depth=${bitDepth} color=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const inflated = inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  const rgb = new Uint8Array(width * height * 3);
  let src = 0;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    inflated.copy(row, 0, src, src + stride);
    src += stride;
    applyPngFilter(filter, row, prev, bpp);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (colorType === 0) {
        rgb[i] = rgb[i + 1] = rgb[i + 2] = row[x];
      } else {
        rgb[i] = row[x * bpp];
        rgb[i + 1] = row[x * bpp + 1];
        rgb[i + 2] = row[x * bpp + 2];
      }
    }
    row.copy(prev);
  }
  return { width, height, rgb };
}

export function compositeSdOverRgb(dstRgb, dstW, dstH, srcRgb, srcW, srcH, alpha = 0.55) {
  const a = Math.min(1, Math.max(0, alpha));
  const ia = 1 - a;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const di = (y * dstW + x) * 3;
      const si = (sy * srcW + sx) * 3;
      dstRgb[di] = Math.round(dstRgb[di] * ia + srcRgb[si] * a);
      dstRgb[di + 1] = Math.round(dstRgb[di + 1] * ia + srcRgb[si + 1] * a);
      dstRgb[di + 2] = Math.round(dstRgb[di + 2] * ia + srcRgb[si + 2] * a);
    }
  }
  return dstRgb;
}
