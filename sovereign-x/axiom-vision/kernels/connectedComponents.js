/**
 * Axiom Vision — Connected Components (Level 2, Deterministic).
 *
 * 8-connected component labeling on a binary mask derived from edge magnitude thresholding.
 * Produces region evidence with area, centroid, and bounding box.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Label connected components using Union-Find (disjoint set).
 * Two-pass algorithm: first pass assigns provisional labels, second pass resolves.
 *
 * @param {Uint8Array} binaryMask - Binary mask (non-zero = foreground)
 * @param {number} width
 * @param {number} height
 * @param {number} tileX - Tile offset X
 * @param {number} tileY - Tile offset Y
 * @param {number} tileW - Tile width
 * @param {number} tileH - Tile height
 * @param {number} tileIndex
 * @param {Object} tileGrid
 * @param {string[]} parentHashes - Hashes of L1 features this was derived from
 * @param {number} minArea - Minimum area to emit a region (default 10)
 * @returns {Object[]} Array of region evidence objects
 */
export function connectedComponents(binaryMask, width, height, tileX, tileY, tileW, tileH, tileIndex, tileGrid, parentHashes, minArea = 10) {
  const labels = new Int32Array(width * height).fill(0);
  const parent = [0]; // Union-Find parent array, index 0 unused
  let nextLabel = 1;

  // Union-Find find with path compression
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  // Union
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  // First pass
  for (let py = tileY; py < tileY + tileH && py < height; py++) {
    for (let px = tileX; px < tileX + tileW && px < width; px++) {
      const idx = py * width + px;
      if (!binaryMask[idx]) continue;

      // Check 8-connected neighbors (only already-processed ones for raster order)
      const neighbors = [];
      if (px > 0 && binaryMask[idx - 1]) neighbors.push(labels[idx - 1]);
      if (py > 0 && binaryMask[idx - width]) neighbors.push(labels[idx - width]);
      if (px > 0 && py > 0 && binaryMask[idx - width - 1]) neighbors.push(labels[idx - width - 1]);
      if (px < width - 1 && py > 0 && binaryMask[idx - width + 1]) neighbors.push(labels[idx - width + 1]);

      if (neighbors.length === 0) {
        labels[idx] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      } else {
        const minLabel = Math.min(...neighbors);
        labels[idx] = minLabel;
        for (const n of neighbors) {
          if (n !== minLabel) union(n, minLabel);
        }
      }
    }
  }

  // Second pass: resolve and accumulate region data
  const regions = new Map(); // rootLabel -> { area, minX, minY, maxX, maxY, sumX, sumY }

  for (let py = tileY; py < tileY + tileH && py < height; py++) {
    for (let px = tileX; px < tileX + tileW && px < width; px++) {
      const idx = py * width + px;
      if (!labels[idx]) continue;

      const root = find(labels[idx]);
      let r = regions.get(root);
      if (!r) {
        r = { area: 0, minX: px, minY: py, maxX: px, maxY: py, sumX: 0, sumY: 0 };
        regions.set(root, r);
      }
      r.area++;
      r.sumX += px;
      r.sumY += py;
      if (px < r.minX) r.minX = px;
      if (py < r.minY) r.minY = py;
      if (px > r.maxX) r.maxX = px;
      if (py > r.maxY) r.maxY = py;
    }
  }

  // Build evidence objects
  const results = [];
  for (const [, r] of regions) {
    if (r.area < minArea) continue;

    results.push(buildEvidence({
      level: 2,
      type: "region",
      geometry: {
        bounding_box: {
          x: r.minX,
          y: r.minY,
          w: r.maxX - r.minX + 1,
          h: r.maxY - r.minY + 1,
        },
      },
      area: r.area,
      method: "connected-components-8way",
      method_version: "1.0.0",
      tile: tileIndex,
      tile_grid: tileGrid,
      parent_hashes: parentHashes,
      confidence: 1.0,
      extra: {
        centroid: {
          x: Math.round((r.sumX / r.area) * 100) / 100,
          y: Math.round((r.sumY / r.area) * 100) / 100,
        },
      },
    }));
  }

  // Sort by area descending for deterministic output
  return results.sort((a, b) => b.area - a.area);
}

/**
 * Create a binary mask from edge magnitude thresholding.
 * @param {Float64Array} magnitude - Gradient magnitude per pixel
 * @param {number} width
 * @param {number} height
 * @param {number} threshold
 * @returns {Uint8Array} Binary mask
 */
export function edgeMagnitudeToMask(magnitude, width, height, threshold) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = magnitude[i] >= threshold ? 1 : 0;
  }
  return mask;
}
