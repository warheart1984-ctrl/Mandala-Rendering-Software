/**
 * pyramid.mjs — multiresolution token pyramid + queryable perception for CPO.
 *
 * The "attention" unlock: instead of shipping every pixel, a host can inspect an
 * image at a coarse canonical resolution, then request a higher-resolution
 * canonical sub-grid for just the region it cares about. Every result is a
 * deterministic function of the CPO and is itself hashable, so a perception query
 * is reproducible and verifiable.
 *
 * ── LEVELS ───────────────────────────────────────────────────────────────────
 *   Full-frame token grids: 8x8, 16x16, 32x32, 64x64.
 *   256x256 is available ONLY as a targeted crop via inspectRegion (a full-frame
 *   256 grid would defeat the point of coarse-to-fine attention).
 *
 * ── DOWNSAMPLE RULE (deterministic) ──────────────────────────────────────────
 *   Each target cell (gx,gy) maps to the source pixel rectangle
 *     [floor(gx*W/level), floor((gx+1)*W/level)) x [floor(gy*H/level), ...)
 *   and takes the MODE (most frequent) palette index in that rectangle. Ties are
 *   broken by the LOWEST palette index (which, by the sorted-RGBA palette order,
 *   is the lowest-keyed color). Empty rectangles (possible when level > dimension)
 *   fall back to nearest-pixel sampling of the rectangle's top-left source pixel.
 *
 * Determinism: pure function of the CPO + query args. No Math.random, no Date.now.
 */
import { createHash } from "node:crypto";

import { decodeRleV1, encodeRleV1 } from "./cpo.mjs";

export const FULL_FRAME_LEVELS = Object.freeze([8, 16, 32, 64]);
export const REGION_LEVELS = Object.freeze([8, 16, 32, 64, 256]);

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Expand a CPO packet's grid to a flat Int32Array of indices (width*height). */
function indicesOf(cpo) {
  const { width, height, grid } = cpo.payload;
  const idx = decodeRleV1(grid);
  if (idx.length !== width * height) {
    throw new Error(`pyramid: grid length ${idx.length} != ${width * height}`);
  }
  return idx;
}

/**
 * Downsample a source index field (srcW x srcH) covering the pixel rectangle
 * [x0,x1) x [y0,y1) into a level x level grid of MODE indices.
 * @returns {Int32Array} length level*level, row-major
 */
function downsampleRegion(indices, srcW, x0, y0, x1, y1, level) {
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  const out = new Int32Array(level * level);
  const counts = new Map();
  for (let gy = 0; gy < level; gy++) {
    const sy0 = y0 + Math.floor((gy * regionH) / level);
    const sy1 = y0 + Math.floor(((gy + 1) * regionH) / level);
    for (let gx = 0; gx < level; gx++) {
      const sx0 = x0 + Math.floor((gx * regionW) / level);
      const sx1 = x0 + Math.floor(((gx + 1) * regionW) / level);
      counts.clear();
      let bestIndex = -1;
      let bestCount = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowBase = sy * srcW;
        for (let sx = sx0; sx < sx1; sx++) {
          const v = indices[rowBase + sx];
          const c = (counts.get(v) ?? 0) + 1;
          counts.set(v, c);
          // Tie-break: keep the lower palette index. Because we iterate colors in
          // encounter order, compare explicitly rather than trusting Map order.
          if (c > bestCount || (c === bestCount && v < bestIndex)) {
            bestCount = c;
            bestIndex = v;
          }
        }
      }
      if (bestIndex < 0) {
        // Empty rectangle (level finer than the region): nearest top-left pixel.
        const nx = Math.min(srcW - 1, sx0);
        const ny = Math.min(Math.floor(indices.length / srcW) - 1, sy0);
        out[gy * level + gx] = indices[ny * srcW + nx];
      } else {
        out[gy * level + gx] = bestIndex;
      }
    }
  }
  return out;
}

/**
 * Build the full token pyramid (all FULL_FRAME_LEVELS). Each level carries the
 * grid indices, its RLE string and a deterministic level_hash.
 * @param {object} cpo CPO packet
 * @returns {{ source_hash:string, levels: Record<number, object> }}
 */
export function buildPyramid(cpo) {
  const { width, height } = cpo.payload;
  const indices = indicesOf(cpo);
  const levels = {};
  for (const level of FULL_FRAME_LEVELS) {
    const grid = downsampleRegion(indices, width, 0, 0, width, height, level);
    const rle = encodeRleV1(grid);
    levels[level] = {
      level,
      width: level,
      height: level,
      indices: Array.from(grid),
      grid: rle,
      level_hash: sha256Hex(Buffer.from(`cpf-level/1|${level}|${rle}`, "utf8")),
    };
  }
  return {
    source_hash: `sha256:${cpo.payload_hash}`,
    palette: cpo.payload.palette,
    levels,
  };
}

/**
 * Coarse canonical grid for a full frame at a given level (8/16/32/64).
 * Accepts a CPO packet, or a payload_hash string together with a resolver/store
 * (`opts.store`) that maps hash -> CPO (no hidden global state, for determinism).
 * @param {object|string} imageHashOrCPO
 * @param {number} level one of FULL_FRAME_LEVELS
 * @param {{ store?: { get(h:string):object } }} [opts]
 * @returns {{ level:number, width:number, height:number, indices:number[], grid:string, palette:number[][], level_hash:string, source_hash:string }}
 */
export function inspectGrid(imageHashOrCPO, level, opts = {}) {
  if (!FULL_FRAME_LEVELS.includes(level)) {
    throw new Error(`inspectGrid: level must be one of ${FULL_FRAME_LEVELS.join(",")}, got ${level}`);
  }
  const cpo = resolveCPO(imageHashOrCPO, opts, "inspectGrid");
  const { width, height } = cpo.payload;
  const indices = indicesOf(cpo);
  const grid = downsampleRegion(indices, width, 0, 0, width, height, level);
  const rle = encodeRleV1(grid);
  return {
    level,
    width: level,
    height: level,
    indices: Array.from(grid),
    grid: rle,
    palette: cpo.payload.palette,
    level_hash: sha256Hex(Buffer.from(`cpf-level/1|${level}|${rle}`, "utf8")),
    source_hash: `sha256:${cpo.payload_hash}`,
  };
}

/**
 * Higher-resolution canonical sub-grid for a normalized crop of the image.
 * Coordinates x,y,width,height are in [0,1] (fractions of the source dimensions).
 * @param {object|string} imageHashOrCPO
 * @param {number} x normalized left in [0,1]
 * @param {number} y normalized top in [0,1]
 * @param {number} width normalized width in (0,1]
 * @param {number} height normalized height in (0,1]
 * @param {number} level one of REGION_LEVELS (256 is crop-only)
 * @param {{ store?: { get(h:string):object } }} [opts]
 * @returns {object}
 */
export function inspectRegion(imageHashOrCPO, x, y, width, height, level, opts = {}) {
  if (!REGION_LEVELS.includes(level)) {
    throw new Error(`inspectRegion: level must be one of ${REGION_LEVELS.join(",")}, got ${level}`);
  }
  for (const [name, v] of [["x", x], ["y", y], ["width", width], ["height", height]]) {
    if (typeof v !== "number" || v < 0 || v > 1) {
      throw new Error(`inspectRegion: ${name} must be in [0,1], got ${v}`);
    }
  }
  if (width <= 0 || height <= 0) throw new Error("inspectRegion: width and height must be > 0");
  if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    throw new Error("inspectRegion: region exceeds image bounds");
  }
  const cpo = resolveCPO(imageHashOrCPO, opts, "inspectRegion");
  const srcW = cpo.payload.width;
  const srcH = cpo.payload.height;
  const indices = indicesOf(cpo);

  let x0 = Math.floor(x * srcW);
  let y0 = Math.floor(y * srcH);
  let x1 = Math.min(srcW, Math.ceil((x + width) * srcW));
  let y1 = Math.min(srcH, Math.ceil((y + height) * srcH));
  // Guarantee at least a 1x1 source rectangle.
  if (x1 <= x0) x1 = Math.min(srcW, x0 + 1);
  if (y1 <= y0) y1 = Math.min(srcH, y0 + 1);
  if (x0 >= srcW) x0 = srcW - 1;
  if (y0 >= srcH) y0 = srcH - 1;

  const grid = downsampleRegion(indices, srcW, x0, y0, x1, y1, level);
  const rle = encodeRleV1(grid);
  const region = { x, y, width, height };
  const pixelRect = { x0, y0, x1, y1 };
  const regionHash = sha256Hex(
    Buffer.from(
      `cpf-region/1|${cpo.payload_hash}|${level}|${x0},${y0},${x1},${y1}|${rle}`,
      "utf8",
    ),
  );
  return {
    level,
    width: level,
    height: level,
    region,
    pixel_rect: pixelRect,
    indices: Array.from(grid),
    grid: rle,
    palette: cpo.payload.palette,
    region_hash: regionHash,
    source_hash: `sha256:${cpo.payload_hash}`,
  };
}

function resolveCPO(imageHashOrCPO, opts, fn) {
  if (imageHashOrCPO && typeof imageHashOrCPO === "object" && imageHashOrCPO.payload) {
    return imageHashOrCPO;
  }
  if (typeof imageHashOrCPO === "string") {
    const key = imageHashOrCPO.startsWith("sha256:") ? imageHashOrCPO.slice(7) : imageHashOrCPO;
    if (opts.store && typeof opts.store.get === "function") {
      const cpo = opts.store.get(key) ?? opts.store.get(imageHashOrCPO);
      if (cpo) return cpo;
      throw new Error(`${fn}: hash ${imageHashOrCPO} not found in provided store`);
    }
    throw new Error(
      `${fn}: a payload_hash was given but no { store } resolver was provided; pass the CPO packet or a store`,
    );
  }
  throw new Error(`${fn}: expected a CPO packet or a payload_hash string`);
}

/**
 * Minimal deterministic in-memory hash -> CPO store, so hash-addressed queries
 * work without any hidden global mutable state. Callers opt in explicitly.
 */
export class CPOStore {
  constructor() {
    this._map = new Map();
  }

  put(cpo) {
    this._map.set(cpo.payload_hash, cpo);
    return cpo.payload_hash;
  }

  get(hash) {
    return this._map.get(hash);
  }

  has(hash) {
    return this._map.has(hash);
  }
}
