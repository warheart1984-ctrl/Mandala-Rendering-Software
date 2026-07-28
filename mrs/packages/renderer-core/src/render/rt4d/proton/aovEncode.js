/**
 * AOV encode helpers for judge-wow triptych (beauty + depth + normal).
 *
 * STATUS: **enforced**
 *
 * Depth: Float32 → grayscale PNG (min–max normalize; background stays 0).
 * Normals: packed xyz → (n*0.5+0.5)*255 RGB PNG.
 *
 * @see docs/governance/cecp/trails/judge-wow-2026-07/01-architect-adr.md
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { encodePngRgba } from "./rasterToImage.js";

/**
 * @param {unknown} depthField
 * @returns {{ width: number, height: number, depth: Float32Array, min: number, max: number }}
 */
function resolveDepth(depthField) {
  if (!depthField || typeof depthField !== "object") {
    throw new Error("encodeDepthPng: DepthField required");
  }
  const f = /** @type {Record<string, unknown>} */ (depthField);
  const width = Number(f.width) | 0;
  const height = Number(f.height) | 0;
  if (width < 1 || height < 1) {
    throw new Error("encodeDepthPng: invalid width/height");
  }
  const depth =
    f.depth instanceof Float32Array
      ? f.depth
      : Array.isArray(f.depth)
        ? Float32Array.from(f.depth)
        : null;
  if (!depth || depth.length < width * height) {
    throw new Error("encodeDepthPng: Float32 depth buffer required");
  }
  let min = typeof f.min === "number" && Number.isFinite(f.min) ? f.min : Infinity;
  let max = typeof f.max === "number" && Number.isFinite(f.max) ? f.max : -Infinity;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    min = Infinity;
    max = 0;
    for (let i = 0; i < width * height; i++) {
      const d = depth[i];
      if (!Number.isFinite(d)) continue;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (!Number.isFinite(min)) min = 0;
  }
  return { width, height, depth, min, max };
}

/**
 * Encode a depth field / buffer to PNG bytes (grayscale RGB).
 * @param {unknown} depthField
 * @param {{ width?: number, height?: number }} [_opts]
 * @returns {Buffer}
 */
export function encodeDepthPng(depthField, _opts = {}) {
  const { width, height, depth, min, max } = resolveDepth(depthField);
  // Covered-only span (ignore empty 0) so near→bright, far→dark, empty→black.
  let cMin = Infinity;
  let cMax = -Infinity;
  for (let i = 0; i < width * height; i++) {
    const d = depth[i];
    if (!Number.isFinite(d) || d <= 0) continue;
    if (d < cMin) cMin = d;
    if (d > cMax) cMax = d;
  }
  if (!Number.isFinite(cMin)) {
    cMin = Number.isFinite(min) ? min : 0;
    cMax = Number.isFinite(max) ? max : 1;
  }
  const span = cMax > cMin ? cMax - cMin : 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const d = depth[i];
    let g = 0;
    if (Number.isFinite(d) && d > 0) {
      const t = (d - cMin) / span;
      g = Math.max(0, Math.min(255, Math.round((1 - t) * 255)));
    }
    const o = i * 4;
    rgba[o] = g;
    rgba[o + 1] = g;
    rgba[o + 2] = g;
    rgba[o + 3] = 255;
  }
  return encodePngRgba(width, height, rgba);
}

/**
 * @param {unknown} normalField
 * @returns {{ width: number, height: number, normals: Float32Array }}
 */
function resolveNormals(normalField) {
  if (!normalField || typeof normalField !== "object") {
    throw new Error("encodeNormalPng: NormalField required");
  }
  const f = /** @type {Record<string, unknown>} */ (normalField);
  const width = Number(f.width) | 0;
  const height = Number(f.height) | 0;
  if (width < 1 || height < 1) {
    throw new Error("encodeNormalPng: invalid width/height");
  }
  const normals =
    f.normals instanceof Float32Array
      ? f.normals
      : Array.isArray(f.normals)
        ? Float32Array.from(f.normals)
        : null;
  if (!normals || normals.length < width * height * 3) {
    throw new Error("encodeNormalPng: packed xyz normals required");
  }
  return { width, height, normals };
}

/**
 * Encode a normal field / buffer to PNG bytes.
 * @param {unknown} normalField
 * @param {{ width?: number, height?: number }} [_opts]
 * @returns {Buffer}
 */
export function encodeNormalPng(normalField, _opts = {}) {
  const { width, height, normals } = resolveNormals(normalField);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const ni = i * 3;
    const nx = normals[ni] || 0;
    const ny = normals[ni + 1] || 0;
    const nz = normals[ni + 2] || 0;
    const o = i * 4;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) {
      // Uncovered → black (not mid-gray from packing 0,0,0)
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255;
      continue;
    }
    rgba[o] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
    rgba[o + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
    rgba[o + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
    rgba[o + 3] = 255;
  }
  return encodePngRgba(width, height, rgba);
}

/**
 * Write beauty + depth + normal AOVs for a judge-wow triptych.
 * @param {{
 *   outDir: string,
 *   beautyPng?: Buffer|Uint8Array,
 *   depth?: unknown,
 *   normals?: unknown,
 *   depthPng?: Buffer|Uint8Array,
 *   normalPng?: Buffer|Uint8Array,
 *   beautyName?: string,
 *   depthName?: string,
 *   normalName?: string,
 * }} payload
 * @returns {Promise<{
 *   beautyPath: string,
 *   depthPath: string,
 *   normalPath: string,
 *   beautySha256?: string,
 *   depthSha256: string,
 *   normalSha256: string,
 * }>}
 */
export async function writeTriptychAovs(payload) {
  if (!payload || typeof payload.outDir !== "string" || !payload.outDir) {
    throw new Error("writeTriptychAovs: outDir required");
  }
  const outDir = payload.outDir;
  mkdirSync(outDir, { recursive: true });

  const beautyName = payload.beautyName ?? "beauty.png";
  const depthName = payload.depthName ?? "depth.png";
  const normalName = payload.normalName ?? "normal.png";

  const beautyPath = join(outDir, beautyName);
  const depthPath = join(outDir, depthName);
  const normalPath = join(outDir, normalName);

  /** @type {string|undefined} */
  let beautySha256;
  if (payload.beautyPng) {
    mkdirSync(dirname(beautyPath), { recursive: true });
    writeFileSync(beautyPath, payload.beautyPng);
    beautySha256 = createHash("sha256").update(payload.beautyPng).digest("hex");
  }

  const depthPng =
    payload.depthPng ??
    (payload.depth != null ? encodeDepthPng(payload.depth) : null);
  if (!depthPng) {
    throw new Error("writeTriptychAovs: depth field or depthPng required");
  }
  writeFileSync(depthPath, depthPng);

  const normalPng =
    payload.normalPng ??
    (payload.normals != null ? encodeNormalPng(payload.normals) : null);
  if (!normalPng) {
    throw new Error("writeTriptychAovs: normals field or normalPng required");
  }
  writeFileSync(normalPath, normalPng);

  return {
    beautyPath,
    depthPath,
    normalPath,
    beautySha256,
    depthSha256: createHash("sha256").update(depthPng).digest("hex"),
    normalSha256: createHash("sha256").update(normalPng).digest("hex"),
  };
}
