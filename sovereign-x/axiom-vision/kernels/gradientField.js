/**
 * Axiom Vision — Gradient Field (Level 1, Deterministic).
 *
 * Computes dense gradient magnitude and direction fields using Sobel.
 * Useful for texture analysis, flow estimation preprocessing.
 *
 * Output: downsampled gradient field (configurable stride for efficiency).
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Compute gradient field on a tile.
 *
 * @param {Uint8Array} rgba - Full image RGBA buffer
 * @param {number} width
 * @param {number} height
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} tileW
 * @param {number} tileH
 * @param {number} tileIndex
 * @param {Object} tileGrid
 * @param {number} stride - Sampling stride (default 8, i.e. every 8th pixel)
 * @param {string} parentHash
 * @returns {Object} Gradient field evidence object
 */
export function gradientField(rgba, width, height, tileX, tileY, tileW, tileH, tileIndex, tileGrid, stride = 8, parentHash = "") {
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const magnitudes = [];
  const directions = [];
  let sumMag = 0;
  let maxMag = 0;
  let count = 0;

  for (let py = tileY; py < tileY + tileH && py < height; py += stride) {
    for (let px = tileX; px < tileX + tileW && px < width; px += stride) {
      // Sobel 3x3 with border clamping
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const x = Math.min(Math.max(px + kx, 0), width - 1);
          const y = Math.min(Math.max(py + ky, 0), height - 1);
          const val = gray[y * width + x];
          const ki = (ky + 1) * 3 + (kx + 1);
          const sx = [-1, 0, 1, -2, 0, 2, -1, 0, 1][ki];
          const sy = [-1, -2, -1, 0, 0, 0, 1, 2, 1][ki];
          gx += val * sx;
          gy += val * sy;
        }
      }

      const mag = Math.sqrt(gx * gx + gy * gy);
      const dir = (Math.atan2(gy, gx) * 180 / Math.PI + 360) % 360;

      magnitudes.push(Math.round(mag * 1000) / 1000);
      directions.push(Math.round(dir * 100) / 100);
      sumMag += mag;
      if (mag > maxMag) maxMag = mag;
      count++;
    }
  }

  return buildEvidence({
    level: 1,
    type: "gradient_field",
    method: "sobel-gradient-field",
    method_version: "1.0.0",
    tile: tileIndex,
    tile_grid: tileGrid,
    parent_hashes: parentHash ? [parentHash] : [],
    confidence: 1.0,
    extra: {
      stride,
      sample_count: count,
      mean_magnitude: Math.round((sumMag / count) * 1000) / 1000,
      max_magnitude: Math.round(maxMag * 1000) / 1000,
      magnitudes,
      directions,
    },
  });
}
