/**
 * CPU isotropic soft splat accumulate.
 *
 * STATUS: **enforced**
 *
 * NEW sibling path — not Engine3D triangle soft-raster.
 * P4: stable footprint order; no PRNG in accumulate; wall-clock excluded from frameSha256.
 */

import { createHash } from "node:crypto";

const SUPPORT_SIGMA = 3;

/**
 * @param {unknown} color
 * @returns {[number, number, number]}
 */
function rgb01(color) {
  if (typeof color === "number" && Number.isFinite(color)) {
    const c = Math.min(1, Math.max(0, color));
    return [c, c, c];
  }
  if (Array.isArray(color) && color.length >= 3) {
    return [
      Math.min(1, Math.max(0, Number(color[0]) || 0)),
      Math.min(1, Math.max(0, Number(color[1]) || 0)),
      Math.min(1, Math.max(0, Number(color[2]) || 0)),
    ];
  }
  return [0.85, 0.9, 1];
}

/**
 * Accumulate isotropic soft footprints into an RGBA buffer.
 *
 * @param {import("./types.js").ProtonFootprint2D[]} footprints
 * @param {{
 *   width?: number,
 *   height?: number,
 *   intentId?: string,
 *   worldId?: string,
 *   timelineId?: string,
 *   timeSeconds?: number,
 *   protonsHash?: string,
 *   protonCount?: number,
 *   clearColor?: [number, number, number, number],
 *   cir?: import("./types.js").CirOverlay,
 *   parameters?: Record<string, unknown>,
 * }} [opts]
 * @returns {{ rgba: Uint8ClampedArray, evidence: import("./types.js").ProtonRasterEvidence, floatBuffer: Float32Array }}
 */
export function softSplatAccumulate(footprints = [], opts = {}) {
  const intentId = opts.intentId;
  if (typeof intentId !== "string" || intentId.length === 0) {
    throw new Error(
      "softSplatAccumulate: intentId is required (CIR/IntentRecord overlay). Refusing splat without provenance.",
    );
  }

  const width = Math.max(1, Math.floor(opts.width ?? 256));
  const height = Math.max(1, Math.floor(opts.height ?? 256));
  const n = width * height;
  const floatBuffer = new Float32Array(n * 4);

  const clear = Array.isArray(opts.clearColor)
    ? opts.clearColor
    : [0.02, 0.03, 0.04, 1];
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    floatBuffer[idx] = Number(clear[0]) || 0;
    floatBuffer[idx + 1] = Number(clear[1]) || 0;
    floatBuffer[idx + 2] = Number(clear[2]) || 0;
    floatBuffer[idx + 3] = clear[3] != null ? Number(clear[3]) : 1;
  }

  // Stable order by id (P4) — no PRNG
  const sorted = (Array.isArray(footprints) ? footprints : [])
    .slice()
    .sort((a, b) => {
      const ia = String(a?.id ?? "");
      const ib = String(b?.id ?? "");
      if (ia < ib) return -1;
      if (ia > ib) return 1;
      return 0;
    });

  for (const fp of sorted) {
    if (!fp || typeof fp !== "object") continue;
    const sigma = Math.max(0.5, Number(fp.sigma) || 0.5);
    const cx = Number(fp.x);
    const cy = Number(fp.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const opacity =
      typeof fp.opacity === "number"
        ? fp.opacity
        : typeof fp.weight === "number"
          ? fp.weight
          : 1;
    const [cr, cg, cb] = rgb01(fp.color);
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
        // Premultiplied src
        const sr = cr * w;
        const sg = cg * w;
        const sb = cb * w;
        const sa = Math.min(1, w);
        const idx = (y * width + x) * 4;
        const dr = floatBuffer[idx];
        const dg = floatBuffer[idx + 1];
        const db = floatBuffer[idx + 2];
        const da = floatBuffer[idx + 3];
        const inv = 1 - sa;
        floatBuffer[idx] = sr + dr * inv;
        floatBuffer[idx + 1] = sg + dg * inv;
        floatBuffer[idx + 2] = sb + db * inv;
        floatBuffer[idx + 3] = sa + da * inv;
      }
    }
  }

  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    rgba[idx] = Math.min(255, Math.max(0, Math.round(floatBuffer[idx] * 255)));
    rgba[idx + 1] = Math.min(
      255,
      Math.max(0, Math.round(floatBuffer[idx + 1] * 255)),
    );
    rgba[idx + 2] = Math.min(
      255,
      Math.max(0, Math.round(floatBuffer[idx + 2] * 255)),
    );
    rgba[idx + 3] = Math.min(
      255,
      Math.max(0, Math.round(floatBuffer[idx + 3] * 255)),
    );
  }

  const frameSha256 = createHash("sha256").update(Buffer.from(rgba)).digest("hex");
  const protonCount =
    typeof opts.protonCount === "number"
      ? opts.protonCount
      : sorted.length;

  /** @type {import("./types.js").ProtonRasterEvidence} */
  const evidence = {
    intentId,
    protonCount,
    kernel: { type: "gaussian2d", supportSigma: SUPPORT_SIGMA },
    width,
    height,
    frameSha256,
    status: "enforced",
  };
  if (opts.worldId) evidence.worldId = opts.worldId;
  if (opts.timelineId) evidence.timelineId = opts.timelineId;
  if (opts.timeSeconds != null) evidence.timeSeconds = opts.timeSeconds;
  if (opts.protonsHash) evidence.protonsHash = opts.protonsHash;
  if (opts.cir) evidence.cir = opts.cir;
  if (opts.parameters) evidence.parameters = opts.parameters;

  return { rgba, evidence, floatBuffer };
}
