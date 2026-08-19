/**
 * SME-VIS deterministic encoder simulation.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * Implements the SME-VIS-IFC contract shape: IMG_RAW -> VIS_EMBED (512-dim),
 * VIS_FEATURES, VIS_EVIDENCE (region -> feature mapping for audit).
 * Embeddings are computed from real pixel statistics projected into a
 * deterministic seeded basis, satisfying traceability of VIS_EMBED to IMG_RAW.
 */

import { sha256Hex, sha256Prefixed, stableStringify } from "../core/hash.js";
import { featureProjection } from "./embeddings.js";

export const VIS_VERSION = "sme-vis-deterministic-v1.0.0";

const GRID = 8;
const EMBED_DIM = 512;

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function symmetryScore(pixels, width, height) {
  let diff = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width / 2; x++) {
      const a = (y * width + x) * 3;
      const b = (y * width + (width - 1 - x)) * 3;
      diff += Math.abs(pixels[a] - pixels[b]);
      diff += Math.abs(pixels[a + 1] - pixels[b + 1]);
      diff += Math.abs(pixels[a + 2] - pixels[b + 2]);
      total += 3;
    }
  }
  return total === 0 ? 0 : 1 - diff / (total * 255);
}

function dominantColors(pixels, width, height) {
  const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 3) {
    const r = Math.round(pixels[i] / 32) * 32;
    const g = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const sorted = Array.from(buckets.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3);
  return sorted.map(([k]) => k.split(",").map(Number));
}

function buildRegionEvidence(pixels, width, height) {
  const regions = [];
  const cellW = width / GRID;
  const cellH = height / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.floor((gx + 1) * cellW);
      const y0 = Math.floor(gy * cellH);
      const y1 = Math.floor((gy + 1) * cellH);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          rSum += pixels[i];
          gSum += pixels[i + 1];
          bSum += pixels[i + 2];
          n++;
        }
      }
      const r = n ? rSum / n : 0;
      const g = n ? gSum / n : 0;
      const b = n ? bSum / n : 0;
      const max = Math.max(r, g, b);
      const feature =
        max === r ? "red-dominant" : max === g ? "green-dominant" : "blue-dominant";
      regions.push({
        region: { x0, y0, x1, y1 },
        meanColor: [Math.round(r), Math.round(g), Math.round(b)],
        feature,
      });
    }
  }
  return regions;
}

/**
 * Encode a generated image into a 512-dim VIS_EMBED plus features and evidence.
 */
export function encodeImage(image, { seed = 0, intentId = "intent.default" }) {
  const { pixels, width, height } = image;
  const features = [];
  const cellW = width / GRID;
  const cellH = height / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.floor((gx + 1) * cellW);
      const y0 = Math.floor(gy * cellH);
      const y1 = Math.floor((gy + 1) * cellH);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          rSum += pixels[i];
          gSum += pixels[i + 1];
          bSum += pixels[i + 2];
          n++;
        }
      }
      if (n) {
        features.push(rSum / n / 128 - 1, gSum / n / 128 - 1, bSum / n / 128 - 1);
      }
    }
  }

  let edgeEnergy = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = (y * width + x) * 3;
      const p = i - 3;
      edgeEnergy +=
        Math.abs(pixels[i] - pixels[p]) +
        Math.abs(pixels[i + 1] - pixels[p + 1]) +
        Math.abs(pixels[i + 2] - pixels[p + 2]);
    }
  }
  features.push(edgeEnergy / (width * height * 765) * 2 - 1);

  const sym = symmetryScore(pixels, width, height);
  features.push(sym * 2 - 1);

  const embedding = featureProjection(features, EMBED_DIM, `${intentId}:vis:proj:${seed}`);

  const colors = dominantColors(pixels, width, height);
  const featuresOut = {
    objects: [],
    scenes: sym > 0.5 ? ["mandala", "symmetrical"] : ["mandala", "asymmetrical"],
    attributes: edgeEnergy > 0.1 ? ["high-detail", "edges"] : ["smooth", "gradient"],
    colors: { dominant: colors[0] || [0, 0, 0], accent: colors[1] || [0, 0, 0] },
  };
  const evidence = { regions: buildRegionEvidence(pixels, width, height) };

  const evidenceId = `ev-vis-${sha256Hex(`${intentId}:${image.checksum}`).slice(0, 12)}`;
  const checksum = sha256Prefixed(stableStringify({ embedding, features: featuresOut, evidence }));

  return {
    modality: "image",
    embedding,
    features: featuresOut,
    evidence,
    evidenceId,
    checksum,
    modelVersion: VIS_VERSION,
    sourceChecksum: image.checksum,
  };
}
