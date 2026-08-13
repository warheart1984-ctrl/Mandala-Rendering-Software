/**
 * Axiom Vision — Color Histogram (Level 1, Deterministic).
 *
 * Computes per-channel color histograms on a tile.
 * Used for dominant color analysis, palette extraction.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Compute color histogram on a tile.
 *
 * @param {Uint8Array} rgba - Full image RGBA buffer
 * @param {number} width - Full image width
 * @param {number} height - Full image height
 * @param {number} tileX - Tile column offset
 * @param {number} tileY - Tile row offset
 * @param {number} tileW - Tile width
 * @param {number} tileH - Tile height
 * @param {number} tileIndex - Global tile index
 * @param {Object} tileGrid - { cols, rows, tile_width, tile_height }
 * @param {number} bins - Number of bins per channel (default 16)
 * @param {string} parentHash - Parent hash for lineage
 * @returns {Object} Color histogram evidence object
 */
export function colorHistogram(rgba, width, height, tileX, tileY, tileW, tileH, tileIndex, tileGrid, bins = 16, parentHash = "") {
  const binCounts = new Float64Array(bins * 3); // r, g, b interleaved
  const binSize = 256 / bins;
  let pixelCount = 0;

  // Track dominant color
  let maxR = 0, maxG = 0, maxB = 0;
  let maxRCount = 0, maxGCount = 0, maxBCount = 0;

  for (let py = tileY; py < tileY + tileH && py < height; py++) {
    for (let px = tileX; px < tileX + tileW && px < width; px++) {
      const i = (py * width + px) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];

      const rBin = Math.min(Math.floor(r / binSize), bins - 1);
      const gBin = Math.min(Math.floor(g / binSize), bins - 1);
      const bBin = Math.min(Math.floor(b / binSize), bins - 1);

      binCounts[rBin]++;
      binCounts[bins + gBin]++;
      binCounts[bins * 2 + bBin]++;

      // Dominant per-channel
      if (binCounts[rBin] > maxRCount) { maxRCount = binCounts[rBin]; maxR = rBin; }
      if (binCounts[bins + gBin] > maxGCount) { maxGCount = binCounts[bins + gBin]; maxG = gBin; }
      if (binCounts[bins * 2 + bBin] > maxBCount) { maxBCount = binCounts[bins * 2 + bBin]; maxB = bBin; }

      pixelCount++;
    }
  }

  // Normalize counts
  const totalR = binCounts.subarray(0, bins).reduce((a, b) => a + b, 0);
  const totalG = binCounts.subarray(bins, bins * 2).reduce((a, b) => a + b, 0);
  const totalB = binCounts.subarray(bins * 2, bins * 3).reduce((a, b) => a + b, 0);

  const rHist = Array.from(binCounts.subarray(0, bins)).map(c => Math.round((c / totalR) * 10000) / 10000);
  const gHist = Array.from(binCounts.subarray(bins, bins * 2)).map(c => Math.round((c / totalG) * 10000) / 10000);
  const bHist = Array.from(binCounts.subarray(bins * 2, bins * 3)).map(c => Math.round((c / totalB) * 10000) / 10000);

  return buildEvidence({
    level: 1,
    type: "color_histogram",
    method: "per-channel-histogram",
    method_version: "1.0.0",
    tile: tileIndex,
    tile_grid: tileGrid,
    parent_hashes: parentHash ? [parentHash] : [],
    confidence: 1.0,
    extra: {
      bins,
      pixel_count: pixelCount,
      r_histogram: rHist,
      g_histogram: gHist,
      b_histogram: bHist,
      dominant_rgb: [
        Math.round((maxR + 0.5) * binSize),
        Math.round((maxG + 0.5) * binSize),
        Math.round((maxB + 0.5) * binSize),
      ],
    },
  });
}
