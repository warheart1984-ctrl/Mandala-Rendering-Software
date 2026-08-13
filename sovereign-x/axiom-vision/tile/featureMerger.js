/**
 * Axiom Vision — Feature Merger.
 *
 * Merges tile-level features into a global feature set.
 * Handles:
 *   - Cross-tile deduplication (edges/contours that span tile boundaries)
 *   - Stable sorting by feature_id for deterministic output
 *   - Lineage tracking (tile_lineage for cross-tile features)
 */

import { quantizeCoord, getTileBounds } from "./tileSplitter.js";

/**
 * Merge features from multiple tiles into a global set.
 *
 * @param {Object[]} tileResults - Array of { tileIndex, features: [...], grid, imageWidth, imageHeight }
 * @returns {Object[]} Deduplicated, sorted feature array
 */
export function mergeTileFeatures(tileResults) {
  const global = [];
  const dedupIndex = new Map(); // quantized key -> existing feature

  for (const result of tileResults) {
    const { tileIndex, features, grid, imageWidth, imageHeight } = result;
    const tileBounds = getTileBounds(tileIndex, grid, imageWidth, imageHeight);

    for (const feature of features) {
      if (feature.level > 1) {
        // Level 2+ features are global by nature (regions, contours)
        global.push(feature);
        continue;
      }

      // Level 1 features: check for cross-tile dedup
      if (feature.geometry && isNearBoundary(feature, tileBounds)) {
        const key = makeDedupKey(feature);
        if (dedupIndex.has(key)) {
          const existing = dedupIndex.get(key);
          // Merge: union tile lineage, keep higher magnitude
          if (!existing.tile_lineage) existing.tile_lineage = [existing.tile];
          if (!existing.tile_lineage.includes(tileIndex)) {
            existing.tile_lineage.push(tileIndex);
          }
          if (feature.magnitude != null && existing.magnitude != null) {
            existing.magnitude = Math.max(existing.magnitude, feature.magnitude);
          }
          continue;
        }
        dedupIndex.set(key, feature);
        feature.tile_lineage = [tileIndex];
      }

      global.push(feature);
    }
  }

  // Stable sort by feature_id for deterministic output
  return global.sort((a, b) => a.feature_id.localeCompare(b.feature_id));
}

function isNearBoundary(feature, tileBounds) {
  const geom = feature.geometry;
  if (!geom) return false;
  const margin = 3;
  const x0 = geom.x0 ?? geom.x ?? 0;
  const y0 = geom.y0 ?? geom.y ?? 0;
  return (
    x0 <= tileBounds.x + margin ||
    y0 <= tileBounds.y + margin ||
    x0 >= tileBounds.x + tileBounds.w - margin ||
    y0 >= tileBounds.y + tileBounds.h - margin
  );
}

function makeDedupKey(feature) {
  const geom = feature.geometry;
  const x0 = quantizeCoord(geom.x0 ?? geom.x ?? 0);
  const y0 = quantizeCoord(geom.y0 ?? geom.y ?? 0);
  return `${feature.type}:${x0}:${y0}`;
}

/**
 * Merge color histograms across tiles by averaging.
 *
 * @param {Object[]} histograms - Array of histogram evidence objects
 * @returns {Object} Single merged histogram
 */
export function mergeHistograms(histograms) {
  if (histograms.length === 0) return null;
  if (histograms.length === 1) return histograms[0];

  const bins = histograms[0].bins;
  const n = histograms.length;

  const rMerged = new Array(bins).fill(0);
  const gMerged = new Array(bins).fill(0);
  const bMerged = new Array(bins).fill(0);

  for (const h of histograms) {
    for (let i = 0; i < bins; i++) {
      rMerged[i] += h.r_histogram[i];
      gMerged[i] += h.g_histogram[i];
      bMerged[i] += h.b_histogram[i];
    }
  }

  return {
    ...histograms[0],
    r_histogram: rMerged.map(v => Math.round((v / n) * 10000) / 10000),
    g_histogram: gMerged.map(v => Math.round((v / n) * 10000) / 10000),
    b_histogram: bMerged.map(v => Math.round((v / n) * 10000) / 10000),
    tile_lineage: histograms.map(h => h.tile),
  };
}

/**
 * Merge gradient fields across tiles by concatenation.
 *
 * @param {Object[]} fields - Array of gradient field evidence objects
 * @returns {Object} Single merged gradient field
 */
export function mergeGradientFields(fields) {
  if (fields.length === 0) return null;
  if (fields.length === 1) return fields[0];

  let totalSamples = 0;
  let sumMag = 0;
  let maxMag = 0;
  const allMags = [];
  const allDirs = [];

  for (const f of fields) {
    totalSamples += f.sample_count;
    sumMag += f.mean_magnitude * f.sample_count;
    if (f.max_magnitude > maxMag) maxMag = f.max_magnitude;
    allMags.push(...f.magnitudes);
    allDirs.push(...f.directions);
  }

  return {
    ...fields[0],
    sample_count: totalSamples,
    mean_magnitude: Math.round((sumMag / totalSamples) * 1000) / 1000,
    max_magnitude: Math.round(maxMag * 1000) / 1000,
    magnitudes: allMags,
    directions: allDirs,
    tile_lineage: fields.map(f => f.tile),
  };
}
