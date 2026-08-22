/**
 * Polar-safe tiled accumulator. No atomic<f32>.
 *
 * CPU prefix-sum writes TileHeaders.offset from tile counts.
 * BinPaths: only atomicAdd on u32 count; entries[offset+dst] = pathIndex.
 * TiledAccumulate: one workgroup per tile, shared SoA tileReal[16][17] /
 * tileImag[16][17], barrier, then exactly one writer per pixel (plain stores).
 *
 * Local tile coords MUST use the BinPaths map, not `pixelId % 16`:
 *   px = pixelId % frameWidth
 *   holoX = px * holoResX / frameWidth   (or px if same res)
 *   lx = holoX % TILE_SIZE
 * `pixelId % 16` is only valid when the frame is 16 px wide.
 */

import { TILE_SIZE, POLAR_TILE_STRIDE, createComplexField } from "./types.js";
import { binPaths, localTileXYFromPixelId, prefixSumOffsets } from "./aligned.js";
import { complexContrib } from "./accumulate.js";
import { rejectUnreadyPaths } from "./gate.js";

/** Flattened SoA: tileReal[16][17] / tileImag[16][17] → 272. Column 16 is Polar bank pad. */
export const POLAR_TILE_FLAT_LEN = TILE_SIZE * POLAR_TILE_STRIDE;
export const POLAR_PAD_COLUMN = TILE_SIZE;

export function flattenPolarSoa(tile2d, stride = POLAR_TILE_STRIDE) {
  const rows = tile2d.length;
  const out = new Float32Array(rows * stride);
  for (let ly = 0; ly < rows; ly++) {
    const row = tile2d[ly];
    for (let lx = 0; lx < row.length; lx++) {
      out[ly * stride + lx] = row[lx];
    }
  }
  return out;
}

/** Column 16 of a flattened 16×17 SoA. Must stay 0 — never a hologram pixel. */
export function polarSoaPadColumn(flat, stride = POLAR_TILE_STRIDE, tileSize = TILE_SIZE) {
  const pad = new Float32Array(tileSize);
  for (let ly = 0; ly < tileSize; ly++) {
    pad[ly] = flat[ly * stride + tileSize] ?? 0;
  }
  return pad;
}

export const TILED_ACCUMULATE_STATUS = Object.freeze({
  cpu: "enforced",
  gpu: "partial",
  atomics: "u32-count-only",
  note: "Polar primary path. No atomic<f32>. One global writer per hologram pixel.",
});

export { prefixSumOffsets, localTileXYFromPixelId };

/**
 * Build TileHeaders with CPU prefix-sum offsets; counts start at 0 for a later u32 atomicAdd.
 */
export function tileHeadersFromCounts(counts) {
  const offsets = prefixSumOffsets(counts);
  return offsets.map((offset, i) => ({ offset, count: 0, reserved: Number(counts[i] ?? 0) }));
}

/**
 * CPU BinPaths model: prefix-sum offsets, then u32-only count increment.
 * Mirrors `atomicAdd(&headers[tileId].count, 1u); entries[offset+dst] = pathIndex`.
 */
export function binPathsU32(paths, opts) {
  rejectUnreadyPaths(paths);
  return binPaths(paths, opts);
}

/**
 * One workgroup per tile. Shared SoA stride 17. One plain store per pixel.
 */
export function tiledAccumulate(field, paths, camera, opts) {
  rejectUnreadyPaths(paths);
  const bins = opts.bins ?? binPathsU32(paths, opts);
  const tileSize = opts.tileSize ?? TILE_SIZE;
  const stride = opts.stride ?? POLAR_TILE_STRIDE;
  const holoResX = opts.holoResX ?? camera.resX;
  const holoResY = opts.holoResY ?? camera.resY;
  const writers = new Uint32Array(field.length);
  const tiles = [];

  for (let tileId = 0; tileId < bins.headers.length; tileId++) {
    const header = bins.headers[tileId];
    const tileReal = Array.from({ length: tileSize }, () => new Float32Array(stride));
    const tileImag = Array.from({ length: tileSize }, () => new Float32Array(stride));

    for (let i = 0; i < header.count; i++) {
      const pathIndex = bins.entries[header.offset + i]?.pathIndex;
      if (pathIndex == null) continue;
      const sample = paths[pathIndex];
      const loc = localTileXYFromPixelId(sample.pixelId, opts);
      const { real, imag } = complexContrib(sample, camera.lambda);
      tileReal[loc.ly][loc.lx] += real;
      tileImag[loc.ly][loc.lx] += imag;
    }

    // barrier (implicit on CPU) — then exactly one writer per pixel
    const tileX = tileId % bins.numTilesX;
    const tileY = Math.trunc(tileId / bins.numTilesX);
    for (let ly = 0; ly < tileSize; ly++) {
      for (let lx = 0; lx < tileSize; lx++) {
        const gx = tileX * tileSize + lx;
        const gy = tileY * tileSize + ly;
        if (gx >= holoResX || gy >= holoResY) continue;
        const idx = gy * holoResX + gx;
        field[idx].real = tileReal[ly][lx];
        field[idx].imag = tileImag[ly][lx];
        writers[idx] += 1;
      }
    }

    const tileRealFlat = flattenPolarSoa(tileReal, stride);
    const tileImagFlat = flattenPolarSoa(tileImag, stride);
    tiles.push({
      tileId,
      tileReal,
      tileImag,
      tileRealFlat,
      tileImagFlat,
      flatLen: tileSize * stride,
      padColumn: tileSize,
    });
  }

  return { field, writers, bins, tiles };
}

export function createTiledField(resX, resY) {
  return createComplexField(resX, resY);
}
