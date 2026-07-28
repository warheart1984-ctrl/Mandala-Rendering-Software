/**
 * Proton HQ tonemap operators (CPU float RGBA).
 *
 * STATUS: **enforced** — exposure + reinhard / aces-lite / none; deterministic.
 * Applied to float beauty BEFORE 8-bit encode. No GPU. No PRNG.
 *
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 */

/**
 * @typedef {object} TonemapOpts
 * @property {"none"|"reinhard"|"aces-lite"} [mode]
 * @property {number} [exposure]
 * @property {number} [gamma]
 */

/**
 * Fitted ACES-lite curve (Narkowicz-style), per channel, deterministic.
 * @param {number} x
 * @returns {number}
 */
function acesLiteChannel(x) {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  const y = (x * (a * x + b)) / (x * (c * x + d) + e);
  return y > 0 ? y : 0;
}

/**
 * Apply tonemap to a float RGBA buffer (length = width*height*4).
 * Operates per RGB; preserves alpha. Returns a new Float32Array unless
 * mode is "none", exposure is 1, and gamma encoding is skipped (identity).
 *
 * STATUS: **enforced**
 *
 * @param {Float32Array|number[]} floatRgba
 * @param {TonemapOpts} [opts]
 * @returns {Float32Array|number[]}
 */
export function applyTonemap(floatRgba, opts = {}) {
  if (!floatRgba || floatRgba.length < 4) {
    throw new Error("applyTonemap: float RGBA buffer required");
  }
  const mode =
    opts.mode === "reinhard" || opts.mode === "aces-lite" || opts.mode === "none"
      ? opts.mode
      : "none";
  const exposure =
    typeof opts.exposure === "number" && Number.isFinite(opts.exposure)
      ? opts.exposure
      : 1;
  const gamma =
    typeof opts.gamma === "number" && opts.gamma > 0 ? opts.gamma : 2.2;
  const applyGamma = mode !== "none" && gamma !== 1;
  const invGamma = applyGamma ? 1 / gamma : 1;

  // Identity fast-path: preserve prior linear*255 path for default presets.
  if (mode === "none" && exposure === 1 && !applyGamma) {
    return floatRgba;
  }

  const n = (floatRgba.length / 4) | 0;
  const out = new Float32Array(n * 4);

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    let r = Number(floatRgba[idx]) * exposure;
    let g = Number(floatRgba[idx + 1]) * exposure;
    let b = Number(floatRgba[idx + 2]) * exposure;
    const a = Number(floatRgba[idx + 3]);

    if (mode === "reinhard") {
      r = r / (1 + r);
      g = g / (1 + g);
      b = b / (1 + b);
    } else if (mode === "aces-lite") {
      r = acesLiteChannel(r);
      g = acesLiteChannel(g);
      b = acesLiteChannel(b);
    }

    if (applyGamma) {
      r = Math.pow(Math.max(0, r), invGamma);
      g = Math.pow(Math.max(0, g), invGamma);
      b = Math.pow(Math.max(0, b), invGamma);
    }

    out[idx] = r;
    out[idx + 1] = g;
    out[idx + 2] = b;
    out[idx + 3] = a;
  }
  return out;
}
