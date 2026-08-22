/**
 * A. Raygen-aligned hologram tiles — locked integer map, no world-to-plane.
 *
 * RT4D raygen (raygen.wgsl): idx = gid.x; px = idx % width; py = idx / width.
 * pixelId = py * frameWidth + px. When 1 thread/pixel, pixelId === idx.
 */

import { TILE_SIZE, TILE_SIZE_X, TILE_SIZE_Y } from "./types.js";

export const ALIGN_MODE = Object.freeze({
  cameraAligned: "camera-aligned",
  worldToPlane: "declared",
});

/** Raygen: paths[idx].pixelId = py * frameWidth + px */
export function pixelIdFromRaygen(px, py, frameWidth) {
  return py * frameWidth + px;
}

export function pixelXYFromPixelId(pixelId, frameWidth) {
  return {
    px: pixelId % frameWidth,
    py: Math.trunc(pixelId / frameWidth),
  };
}

/**
 * Same-res: holoX=px, holoY=py.
 * Else integer scale: px * holoResX / frameWidth (truncating, as in their C++).
 */
export function holoXYFromPixel(px, py, frameWidth, frameHeight, holoResX, holoResY) {
  if (!(frameWidth > 0) || !(frameHeight > 0)) {
    return { holoX: 0, holoY: 0 };
  }
  if (holoResX === frameWidth && holoResY === frameHeight) {
    return { holoX: px, holoY: py };
  }
  return {
    holoX: Math.trunc((px * holoResX) / frameWidth),
    holoY: Math.trunc((py * holoResY) / frameHeight),
  };
}

export function holoXYFromPixelId(pixelId, frameWidth, frameHeight, holoResX, holoResY) {
  const { px, py } = pixelXYFromPixelId(pixelId, frameWidth);
  return holoXYFromPixel(px, py, frameWidth, frameHeight, holoResX, holoResY);
}

export function tileIdFromHolo(holoX, holoY, holoResX, tileSizeX = TILE_SIZE_X, tileSizeY = TILE_SIZE_Y) {
  const tileX = Math.trunc(holoX / tileSizeX);
  const tileY = Math.trunc(holoY / tileSizeY);
  const numTilesX = Math.ceil(holoResX / tileSizeX);
  return {
    tileX,
    tileY,
    tileId: tileY * numTilesX + tileX,
    numTilesX,
  };
}

/**
 * Exclusive prefix-sum of per-tile counts → TileHeaders.offset.
 * GPU BinPaths must receive these offsets already written; it only atomicAdds count.
 */
export function prefixSumOffsets(counts) {
  const offsets = new Array(counts.length);
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    offsets[i] = acc;
    acc += Number(counts[i] ?? 0);
  }
  return offsets;
}

/**
 * Local tile coords. Same map as BinPaths.
 * WRONG: `pixelId % 16` unless frameWidth === 16.
 * RIGHT: px = pixelId % frameWidth; holoX = px * holoResX / frameWidth; lx = holoX % TILE_SIZE.
 */
export function localTileXYFromPixelId(pixelId, opts) {
  const frameWidth = opts.frameWidth;
  const frameHeight = opts.frameHeight ?? opts.holoResY;
  const tileSize = opts.tileSize ?? TILE_SIZE;
  if (!(frameWidth > 0) || !(tileSize > 0)) {
    return { px: 0, py: 0, holoX: 0, holoY: 0, lx: 0, ly: 0 };
  }
  const { holoX, holoY } = holoXYFromPixelId(
    pixelId,
    frameWidth,
    frameHeight,
    opts.holoResX,
    opts.holoResY,
  );
  return {
    px: pixelId % frameWidth,
    py: Math.trunc(pixelId / frameWidth),
    holoX,
    holoY,
    lx: holoX % tileSize,
    ly: holoY % tileSize,
  };
}

/**
 * 1-thread-per-pixel tile occupancy. Used when PathFinalize fills width×height
 * samples and CPU does not have an explicit `paths` array.
 */
export function tileCountsFromAlignedGrid(opts) {
  const frameWidth = opts.frameWidth;
  const frameHeight = opts.frameHeight ?? opts.holoResY;
  const holoResX = opts.holoResX;
  const holoResY = opts.holoResY;
  const tileSizeX = opts.tileSizeX ?? TILE_SIZE;
  const tileSizeY = opts.tileSizeY ?? TILE_SIZE;
  const numTilesX = Math.ceil((holoResX || 0) / tileSizeX);
  const numTilesY = Math.ceil((holoResY || 0) / tileSizeY);
  const counts = new Array(Math.max(0, numTilesX * numTilesY)).fill(0);
  if (!(frameWidth > 0) || !(frameHeight > 0) || counts.length === 0) return counts;
  for (let py = 0; py < frameHeight; py++) {
    for (let px = 0; px < frameWidth; px++) {
      const { holoX, holoY } = holoXYFromPixel(px, py, frameWidth, frameHeight, holoResX, holoResY);
      const { tileId } = tileIdFromHolo(holoX, holoY, holoResX, tileSizeX, tileSizeY);
      if (tileId >= 0 && tileId < counts.length) counts[tileId] += 1;
    }
  }
  return counts;
}

/**
 * HoloRT4D_BinPaths — CPU model of the compute shader.
 * Offsets must be prefixed first (GPU would pre-scan). Then
 * writeIndex = atomicAdd(headers[tileId].count, 1);
 * entries[headers[tileId].offset + writeIndex].pathIndex = idx.
 * Only the count increment is a u32 atomic; offset is a plain store.
 */
export function binPaths(paths, opts) {
  const frameWidth = opts.frameWidth;
  const frameHeight = opts.frameHeight ?? opts.holoResY;
  const holoResX = opts.holoResX;
  const holoResY = opts.holoResY;
  const tileSizeX = opts.tileSizeX ?? TILE_SIZE;
  const tileSizeY = opts.tileSizeY ?? TILE_SIZE;
  const numTilesX = Math.ceil(holoResX / tileSizeX);
  const numTilesY = Math.ceil(holoResY / tileSizeY);
  const nTiles = numTilesX * numTilesY;

  const tileIds = new Array(paths.length);
  const counts = new Array(nTiles).fill(0);
  for (let idx = 0; idx < paths.length; idx++) {
    const { holoX, holoY } = holoXYFromPixelId(
      paths[idx].pixelId,
      frameWidth,
      frameHeight,
      holoResX,
      holoResY,
    );
    const { tileId } = tileIdFromHolo(holoX, holoY, holoResX, tileSizeX, tileSizeY);
    if (!Number.isInteger(tileId) || tileId < 0 || tileId >= nTiles) {
      tileIds[idx] = -1;
      continue;
    }
    tileIds[idx] = tileId;
    counts[tileId] += 1;
  }

  const offsets = prefixSumOffsets(counts);
  const headers = offsets.map((off) => ({ offset: off, count: 0 }));
  const totalEntries = counts.reduce((a, c) => a + c, 0);
  const entries = new Array(totalEntries);
  for (let idx = 0; idx < paths.length; idx++) {
    const tileId = tileIds[idx];
    if (tileId < 0) continue;
    const writeIndex = headers[tileId].count;
    headers[tileId].count += 1;
    entries[headers[tileId].offset + writeIndex] = { pathIndex: idx };
  }

  return {
    mode: ALIGN_MODE.cameraAligned,
    headers,
    entries,
    numTilesX,
    numTilesY,
    tileSizeX,
    tileSizeY,
  };
}
