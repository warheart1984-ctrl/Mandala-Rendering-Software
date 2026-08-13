/**
 * Axiom Vision — Tile Splitter.
 *
 * Divides an image into tiles for parallel processing.
 * Reuses the deterministic tile grid convention from sovereign-x/axiom-native/node-bindings/tile-worker.js.
 */

/**
 * Compute tile grid dimensions.
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} tileSize - Target tile size (default 256)
 * @returns {Object} { cols, rows, tile_width, tile_height, total }
 */
export function computeTileGrid(width, height, tileSize = 256) {
  const cols = Math.max(1, Math.ceil(width / tileSize));
  const rows = Math.max(1, Math.ceil(height / tileSize));
  const tileWidth = Math.ceil(width / cols);
  const tileHeight = Math.ceil(height / rows);

  return {
    cols,
    rows,
    tile_width: tileWidth,
    tile_height: tileHeight,
    total: cols * rows,
  };
}

/**
 * Get tile pixel bounds for a given tile index.
 *
 * @param {number} tileIndex
 * @param {Object} grid - From computeTileGrid
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {Object} { x, y, w, h, col, row }
 */
export function getTileBounds(tileIndex, grid, imageWidth, imageHeight) {
  const col = tileIndex % grid.cols;
  const row = Math.floor(tileIndex / grid.cols);

  const x = col * grid.tile_width;
  const y = row * grid.tile_height;
  const w = Math.min(grid.tile_width, imageWidth - x);
  const h = Math.min(grid.tile_height, imageHeight - y);

  return { x, y, w, h, col, row };
}

/**
 * Check if a feature touches the tile boundary.
 * Used by the feature merger for cross-tile deduplication.
 *
 * @param {Object} feature - Evidence object with geometry
 * @param {Object} tileBounds - From getTileBounds
 * @param {Object} grid
 * @returns {boolean}
 */
export function featureTouchesTileBoundary(feature, tileBounds, grid) {
  const geom = feature.geometry;
  if (!geom) return false;

  const margin = 2; // pixels from boundary
  const x0 = geom.x0 ?? geom.x ?? 0;
  const y0 = geom.y0 ?? geom.y ?? 0;
  const x1 = geom.x1 ?? (geom.x != null ? geom.x + (geom.w ?? 1) : x0);
  const y1 = geom.y1 ?? (geom.y != null ? geom.y + (geom.h ?? 1) : y0);

  return (
    x0 <= tileBounds.x + margin ||
    y0 <= tileBounds.y + margin ||
    x1 >= tileBounds.x + tileBounds.w - margin ||
    y1 >= tileBounds.y + tileBounds.h - margin
  );
}

/**
 * Quantize a coordinate to a grid for deduplication.
 * Features at the same quantized position across tiles are the same feature.
 *
 * @param {number} value
 * @param {number} quantizeStep - Step size (default 3 pixels)
 * @returns {number}
 */
export function quantizeCoord(value, quantizeStep = 3) {
  return Math.round(value / quantizeStep) * quantizeStep;
}
