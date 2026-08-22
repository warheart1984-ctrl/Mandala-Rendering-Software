/**
 * HoloRT4D debug suite — CPU math of locked shaders. GPU sketches are declared.
 *
 * W-slice shader uses `pixelId % holoResX`. That matches BinPaths only when
 * frameWidth === holoResX. Scaled mode must reuse holoXYFromPixelId.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";
import { TILE_SIZE_X, TILE_SIZE_Y } from "./types.js";
import {
  fieldMagnitude,
  phaseNorm,
  encodeDebugRealImag,
  DEBUG_REAL_IMAG_MAP,
  mapBoundedField,
} from "./accumulate.js";
import { holoXYFromPixelId } from "./aligned.js";

export { DEBUG_REAL_IMAG_MAP, mapBoundedField, encodeDebugRealImag };

export const DEBUG_REAL_IMAG_STATUS = Object.freeze({
  cpu: "enforced",
  gpu: "declared",
  productionPhaseEncode: "unchanged",
  note: "Debug field viz of Re/Im. Not photoreal. Not SLM phase-only. Polar atomic<f32> stays gated.",
});

export const DEBUG_MODE = Object.freeze({
  grid: 0,
  intensity: 1,
  phase: 2,
});

export const PHASE_WHEEL_SIZE = 128;
export const CORNELL_SCENE = "mrs/demo/scene-configs/cornell4d.json";

export function onTileBorder(px, py, tileSizeX = TILE_SIZE_X, tileSizeY = TILE_SIZE_Y) {
  const localX = px % tileSizeX;
  const localY = py % tileSizeY;
  return localX === 0 || localY === 0;
}

export function intensityHeat(rgb, intensity, mix = 0.3) {
  const heat = [intensity * 1.0, intensity * 0.5, intensity * 0.1];
  return [
    rgb[0] * (1 - mix) + (rgb[0] + heat[0]) * mix,
    rgb[1] * (1 - mix) + (rgb[1] + heat[1]) * mix,
    rgb[2] * (1 - mix) + (rgb[2] + heat[2]) * mix,
  ];
}

export function phaseHue(phaseN) {
  return [phaseN, 1 - phaseN, 0.5];
}

/** Debug_HoloTiles overlay (CPU). Borders neon-green on top of all modes. */
export function overlayHoloTile(baseRgb, fieldPixel, px, py, debugMode, tileSizeX, tileSizeY) {
  let rgb = baseRgb.slice();
  const intensity = fieldMagnitude(fieldPixel);
  const pN = phaseNorm(fieldPixel.real, fieldPixel.imag);
  if (debugMode === DEBUG_MODE.intensity) {
    rgb = intensityHeat(rgb, intensity, 0.3);
  } else if (debugMode === DEBUG_MODE.phase) {
    rgb = phaseHue(pN);
  }
  if (onTileBorder(px, py, tileSizeX, tileSizeY)) {
    rgb = [0, 1, 0];
  }
  return { rgb, intensity, phaseNorm: pN, onBorder: onTileBorder(px, py, tileSizeX, tileSizeY) };
}

/** Debug_PhaseWheel: angle = u * 2π; phaseNorm = angle / 2π */
export function phaseWheelColor(u) {
  const angle = u * 2 * Math.PI;
  const pN = angle / (2 * Math.PI);
  return {
    phaseNorm: pN,
    rgb: [pN, 1 - pN, 0.5 + 0.5 * Math.sin(angle)],
  };
}

/**
 * TileSummary: energy = sum|E|, avgPhase = atan(sumIm, sumRe),
 * coherence = |sum(E)| / sum(|E|). sumMag==0 → coherence 0.
 */
export function inspectTile(field, holoResX, startX, startY, tileSizeX, tileSizeY) {
  let sumReal = 0;
  let sumImag = 0;
  let sumMag = 0;
  for (let y = 0; y < tileSizeY; y++) {
    for (let x = 0; x < tileSizeX; x++) {
      const px = startX + x;
      const py = startY + y;
      const idx = py * holoResX + px;
      const p = field[idx] ?? { real: 0, imag: 0 };
      const mag = fieldMagnitude(p);
      sumReal += p.real;
      sumImag += p.imag;
      sumMag += mag;
    }
  }
  const energy = sumMag;
  const avgPhase = Math.atan2(sumImag, sumReal);
  const coherence = sumMag === 0 ? 0 : Math.hypot(sumReal, sumImag) / sumMag;
  return { energy, avgPhase, coherence };
}

export function historyIndex(bounceId, pixelIndex, holoResX, holoResY) {
  return bounceId * (holoResX * holoResY) + pixelIndex;
}

export function playbackIndex(bounceId, px, py, holoResX, holoResY) {
  return bounceId * (holoResX * holoResY) + py * holoResX + px;
}

export function wNorm(w, wMin, wMax) {
  const span = wMax - wMin;
  if (span === 0) return 0;
  const n = (w - wMin) / span;
  return Math.min(1, Math.max(0, n));
}

export function wSliceColor(wVal) {
  return [wVal, 0.2, 1 - wVal, 1];
}

/**
 * W-slice pixel map.
 * Their shader: px = pixelId % holoResX — only valid if frameWidth === holoResX.
 * Scaled aligned mode uses the same holoX/Y as BinPaths.
 */
export function wSlicePixelIndex(pixelId, opts) {
  const { holoResX, frameWidth, frameHeight, holoResY } = opts;
  if (frameWidth != null && frameWidth !== holoResX) {
    const { holoX, holoY } = holoXYFromPixelId(
      pixelId,
      frameWidth,
      frameHeight ?? holoResY,
      holoResX,
      holoResY,
    );
    return holoY * holoResX + holoX;
  }
  const px = pixelId % holoResX;
  const py = Math.trunc(pixelId / holoResX);
  return py * holoResX + px;
}

export function accumulateWSlice(wSlice, paths, opts) {
  for (const p of paths) {
    const idx = wSlicePixelIndex(p.pixelId, opts);
    if (idx < 0 || idx >= wSlice.length) continue;
    wSlice[idx] += wNorm(p.w ?? 0, opts.wMin, opts.wMax);
  }
  return wSlice;
}

function u8(x) {
  return Math.max(0, Math.min(255, Math.round(Number(x) * 255)));
}

/**
 * Rasterize debug Re/Im pixels.
 * layout "rgb": one image, R=real G=imag B=|E| (or 0).
 * layout "sideBySide": left = real gray, right = imag gray.
 */
export function rasterizeDebugRealImag(field, width, height, opts = {}) {
  const pixels = encodeDebugRealImag(field, opts);
  const scale = Math.max(1, Math.trunc(opts.scale ?? 1));
  const layout = opts.layout === "sideBySide" ? "sideBySide" : "rgb";
  const srcW = width;
  const srcH = height;
  const outW = layout === "sideBySide" ? srcW * 2 * scale : srcW * scale;
  const outH = srcH * scale;
  const rgba = new Uint8Array(outW * outH * 4);

  const sample = (sx, sy) => pixels[sy * srcW + sx] ?? { r: 0.5, g: 0.5, b: 0 };

  for (let y = 0; y < outH; y++) {
    const sy = Math.min(srcH - 1, Math.trunc(y / scale));
    for (let x = 0; x < outW; x++) {
      const i = (y * outW + x) * 4;
      if (layout === "sideBySide") {
        const half = srcW * scale;
        const inLeft = x < half;
        const sx = Math.min(srcW - 1, Math.trunc((inLeft ? x : x - half) / scale));
        const p = sample(sx, sy);
        const g = u8(inLeft ? p.r : p.g);
        rgba[i] = g;
        rgba[i + 1] = g;
        rgba[i + 2] = g;
        rgba[i + 3] = 255;
      } else {
        const sx = Math.min(srcW - 1, Math.trunc(x / scale));
        const p = sample(sx, sy);
        rgba[i] = u8(p.r);
        rgba[i + 1] = u8(p.g);
        rgba[i + 2] = u8(p.b);
        rgba[i + 3] = 255;
      }
    }
  }
  return { rgba, width: outW, height: outH, layout, scale, map: DEBUG_REAL_IMAG_MAP };
}

function pngCrc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c;
}

/** Minimal RGBA8 PNG. CPU field → bytes. No cloud. */
export function encodePngRgba8(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(pngCrc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function encodeDebugRealImagPng(field, width, height, opts = {}) {
  const rast = rasterizeDebugRealImag(field, width, height, opts);
  return {
    png: encodePngRgba8(rast.width, rast.height, rast.rgba),
    ...rast,
  };
}

/**
 * Dump CPU debug field viz. Honest: not a photoreal human.
 * Default layout is side-by-side real | imag grayscale.
 */
export function dumpDebugRealImagPng(field, width, height, outPath, opts = {}) {
  const encoded = encodeDebugRealImagPng(field, width, height, {
    layout: "sideBySide",
    ...opts,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encoded.png);
  return {
    path: outPath,
    bytes: encoded.png.length,
    width: encoded.width,
    height: encoded.height,
    layout: encoded.layout,
    map: DEBUG_REAL_IMAG_MAP,
    note: "Debug field viz (Re | Im). Not photoreal. Not SLM phase-only.",
  };
}
