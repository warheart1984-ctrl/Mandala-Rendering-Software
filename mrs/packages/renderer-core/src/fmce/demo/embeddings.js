/**
 * Deterministic embedding math for the SME e2e demo.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * All functions are free of Date.now / Math.random and produce bit-identical
 * output for identical (seed, input) pairs, satisfying replay determinism.
 */

import { sha256Hex } from "../core/hash.js";

export const FIXED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function seededRng(seedStr) {
  const h = sha256Hex(seedStr);
  let a = parseInt(h.slice(0, 8), 16) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function l2Normalize(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function featureProjection(features, dim, seedStr) {
  const rng = seededRng(seedStr);
  const proj = [];
  for (let i = 0; i < features.length; i++) {
    const row = [];
    for (let d = 0; d < dim; d++) row.push(rng() * 2 - 1);
    proj.push(row);
  }
  const out = new Array(dim).fill(0);
  for (let d = 0; d < dim; d++) {
    let acc = 0;
    for (let i = 0; i < features.length; i++) acc += proj[i][d] * features[i];
    out[d] = acc;
  }
  return l2Normalize(out);
}

export function textEmbedding(text, dim, seedStr) {
  const rng = seededRng(seedStr);
  const table = [];
  for (let i = 0; i < dim; i++) table.push(rng() * 2 - 1);
  const vec = new Array(dim).fill(0);
  const t = String(text);
  for (let i = 0; i < t.length; i++) {
    const gram = t.slice(Math.max(0, i - 1), i + 2);
    const idx = parseInt(sha256Hex(gram).slice(0, 8), 16) % dim;
    vec[idx] += table[idx] * (i % 2 === 0 ? 1 : -1);
  }
  return l2Normalize(vec);
}
