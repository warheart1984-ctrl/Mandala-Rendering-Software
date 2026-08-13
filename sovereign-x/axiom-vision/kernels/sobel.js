/**
 * Axiom Vision — Sobel Edge Detection (Level 1, Deterministic).
 *
 * Pure CPU, deterministic, no RNG.
 * 3x3 Sobel kernels for gradient computation.
 *
 * Output: list of edge features with magnitude, direction, geometry.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

const SOBEL_X = [
  -1, 0, 1,
  -2, 0, 2,
  -1, 0, 1,
];

const SOBEL_Y = [
  -1, -2, -1,
   0,  0,  0,
   1,  2,  1,
];

/**
 * Convert RGBA to grayscale luminance.
 * @param {Uint8Array} rgba - Raw RGBA pixel buffer
 * @param {number} width
 * @param {number} height
 * @returns {Float64Array} Luminance values [0, 1]
 */
function toGrayscale(rgba, width, height) {
  const n = width * height;
  const gray = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return gray;
}

/**
 * Apply 3x3 convolution at pixel (px, py) with zero-padding at borders.
 */
function convolve3x3(gray, width, height, px, py, kernel) {
  let sum = 0;
  for (let ky = -1; ky <= 1; ky++) {
    for (let kx = -1; kx <= 1; kx++) {
      const x = Math.min(Math.max(px + kx, 0), width - 1);
      const y = Math.min(Math.max(py + ky, 0), height - 1);
      const ki = (ky + 1) * 3 + (kx + 1);
      sum += gray[y * width + x] * kernel[ki];
    }
  }
  return sum;
}

/**
 * Run Sobel edge detection on a tile.
 *
 * @param {Uint8Array} rgba - Full image RGBA buffer
 * @param {number} width - Full image width
 * @param {number} height - Full image height
 * @param {number} tileX - Tile column offset in pixels
 * @param {number} tileY - Tile row offset in pixels
 * @param {number} tileW - Tile width in pixels
 * @param {number} tileH - Tile height in pixels
 * @param {number} tileIndex - Global tile index
 * @param {Object} tileGrid - { cols, rows, tile_width, tile_height }
 * @param {number} magnitudeThreshold - Minimum magnitude to emit edge (default 0.1)
 * @param {string} parentHash - Hash of the parent (image_hash for tile, or tile-data hash)
 * @returns {Object[]} Array of edge evidence objects
 */
export function sobelDetect(rgba, width, height, tileX, tileY, tileW, tileH, tileIndex, tileGrid, magnitudeThreshold = 0.1, parentHash = "") {
  const gray = toGrayscale(rgba, width, height);
  const edges = [];

  for (let py = tileY; py < tileY + tileH && py < height; py++) {
    for (let px = tileX; px < tileX + tileW && px < width; px++) {
      const gx = convolve3x3(gray, width, height, px, py, SOBEL_X);
      const gy = convolve3x3(gray, width, height, px, py, SOBEL_Y);

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude < magnitudeThreshold) continue;

      const direction = (Math.atan2(gy, gx) * 180 / Math.PI + 360) % 360;

      const edge = buildEvidence({
        level: 1,
        type: "edge",
        geometry: {
          x0: px,
          y0: py,
          x1: px + Math.round(Math.cos(direction * Math.PI / 180)),
          y1: py + Math.round(Math.sin(direction * Math.PI / 180)),
        },
        magnitude: Math.min(magnitude, 1.0),
        direction_degrees: Math.round(direction * 100) / 100,
        method: "sobel-3x3",
        method_version: "1.0.0",
        tile: tileIndex,
        tile_grid: tileGrid,
        parent_hashes: parentHash ? [parentHash] : [],
        confidence: 1.0,
      });

      edges.push(edge);
    }
  }

  return edges;
}

/**
 * Run Sobel on the entire image (non-tiled convenience path).
 */
export function sobelFull(rgba, width, height, magnitudeThreshold = 0.1, parentHash = "") {
  return sobelDetect(
    rgba, width, height,
    0, 0, width, height,
    0,
    { cols: 1, rows: 1, tile_width: width, tile_height: height },
    magnitudeThreshold,
    parentHash
  );
}
