/**
 * CECP Mod 3 — ProjectedProtonField→ProtonRaster
 *
 * STATUS: **enforced**
 *
 * Soft Gaussian splat with associative-stable accumulate (sort by id).
 * Produces beauty float buffer + RGBA + evidence. Also accumulates
 * depth/normal weight sums for mods 4–5 (no second pass required).
 */

import { createHash } from "node:crypto";

const SUPPORT_SIGMA = 3;

/**
 * @typedef {object} ProtonRaster
 * @property {number} width
 * @property {number} height
 * @property {Float32Array} beauty  RGBA float
 * @property {Float32Array} depthSum  weighted depth
 * @property {Float32Array} depthWeight
 * @property {Float32Array} normalSum  xyz * weight
 * @property {Uint8ClampedArray} rgba
 * @property {import("./types.js").ProtonRasterEvidence} evidence
 * @property {string} status
 */

/**
 * @param {import("./projectProtonField.js").ProjectedProtonField} projected
 * @param {{
 *   intentId: string,
 *   worldId?: string,
 *   width?: number,
 *   height?: number,
 *   clearColor?: [number, number, number, number],
 *   protonsHash?: string,
 *   cir?: import("./types.js").CirOverlay,
 *   sigmaScale?: number,
 *   opacityScale?: number,
 * }} opts
 * @returns {ProtonRaster}
 */
export function rasterizeProtons(projected, opts) {
  const intentId = opts?.intentId;
  if (typeof intentId !== "string" || intentId.length === 0) {
    throw new Error(
      "rasterizeProtons: intentId required (CIR/IntentRecord). Refusing ungoverned raster.",
    );
  }
  if (!projected || !Array.isArray(projected.protons)) {
    throw new Error("rasterizeProtons: ProjectedProtonField required");
  }

  const width = Math.max(
    1,
    Math.floor(opts.width ?? projected.camera?.params?.width ?? 256),
  );
  const height = Math.max(
    1,
    Math.floor(opts.height ?? projected.camera?.params?.height ?? 256),
  );
  const n = width * height;
  const beauty = new Float32Array(n * 4);
  const depthSum = new Float32Array(n);
  const depthWeight = new Float32Array(n);
  const normalSum = new Float32Array(n * 3);

  const clear = Array.isArray(opts.clearColor)
    ? opts.clearColor
    : [0.02, 0.03, 0.04, 1];
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    beauty[idx] = Number(clear[0]) || 0;
    beauty[idx + 1] = Number(clear[1]) || 0;
    beauty[idx + 2] = Number(clear[2]) || 0;
    beauty[idx + 3] = clear[3] != null ? Number(clear[3]) : 1;
  }

  const sigmaScale =
    typeof opts.sigmaScale === "number" && opts.sigmaScale > 0
      ? opts.sigmaScale
      : 1;
  const opacityScale =
    typeof opts.opacityScale === "number" && opts.opacityScale > 0
      ? opts.opacityScale
      : 1;

  const sorted = projected.protons.slice().sort((a, b) =>
    String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0,
  );

  for (const fp of sorted) {
    const sigma = Math.max(0.5, (Number(fp.sigma) || 0.5) * sigmaScale);
    const cx = Number(fp.x);
    const cy = Number(fp.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const opacity = Math.min(
      1,
      Math.max(
        0,
        (typeof fp.density === "number" ? fp.density : 1) * opacityScale,
      ),
    );
    const cr = Number(fp.color?.[0]) || 0;
    const cg = Number(fp.color?.[1]) || 0;
    const cb = Number(fp.color?.[2]) || 0;
    const depth = Math.max(0, Number(fp.depth) || 0);
    const nx = Number(fp.normal3?.[0]) || 0;
    const ny = Number(fp.normal3?.[1]) || 0;
    const nz = Number(fp.normal3?.[2]) || 1;
    const support = SUPPORT_SIGMA * sigma;
    const x0 = Math.max(0, Math.floor(cx - support));
    const x1 = Math.min(width - 1, Math.ceil(cx + support));
    const y0 = Math.max(0, Math.floor(cy - support));
    const y1 = Math.min(height - 1, Math.ceil(cy + support));
    const invTwoSigma2 = 1 / (2 * sigma * sigma);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const r2 = dx * dx + dy * dy;
        const w = opacity * Math.exp(-r2 * invTwoSigma2);
        if (w < 1e-8) continue;
        const pi = y * width + x;
        const idx = pi * 4;
        const sr = cr * w;
        const sg = cg * w;
        const sb = cb * w;
        const sa = Math.min(1, w);
        const inv = 1 - sa;
        beauty[idx] = sr + beauty[idx] * inv;
        beauty[idx + 1] = sg + beauty[idx + 1] * inv;
        beauty[idx + 2] = sb + beauty[idx + 2] * inv;
        beauty[idx + 3] = sa + beauty[idx + 3] * inv;

        depthSum[pi] += depth * w;
        depthWeight[pi] += w;
        const ni = pi * 3;
        normalSum[ni] += nx * w;
        normalSum[ni + 1] += ny * w;
        normalSum[ni + 2] += nz * w;
      }
    }
  }

  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    rgba[idx] = Math.min(255, Math.max(0, Math.round(beauty[idx] * 255)));
    rgba[idx + 1] = Math.min(255, Math.max(0, Math.round(beauty[idx + 1] * 255)));
    rgba[idx + 2] = Math.min(255, Math.max(0, Math.round(beauty[idx + 2] * 255)));
    rgba[idx + 3] = Math.min(255, Math.max(0, Math.round(beauty[idx + 3] * 255)));
  }

  const frameSha256 = createHash("sha256").update(Buffer.from(rgba)).digest("hex");

  /** @type {import("./types.js").ProtonRasterEvidence} */
  const evidence = {
    intentId,
    protonCount: sorted.length,
    kernel: { type: "gaussian2d", supportSigma: SUPPORT_SIGMA },
    width,
    height,
    frameSha256,
    status: "enforced",
  };
  if (opts.worldId) evidence.worldId = opts.worldId;
  if (opts.protonsHash) evidence.protonsHash = opts.protonsHash;
  if (opts.cir) evidence.cir = opts.cir;

  return {
    width,
    height,
    beauty,
    depthSum,
    depthWeight,
    normalSum,
    rgba,
    evidence,
    status: "enforced",
  };
}
