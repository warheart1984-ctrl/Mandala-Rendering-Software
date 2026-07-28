/**
 * Image comparison metrics for CPU↔GPU backend equivalence testing.
 *
 * All functions operate on raw RGBA pixel data:
 *   Uint8ClampedArray or Uint8Array with length = width * height * 4
 *
 * Metrics:
 *   - maxPixelDelta  — per-pixel max absolute linear RGB difference
 *   - mse            — mean squared error over all RGB channels
 *   - psnr           — peak signal-to-noise ratio (dB)
 *   - ssim           — structural similarity index (per-channel luminance)
 */

/**
 * Linearize sRGB bytes to [0,1] linear RGB.
 * Approximate inverse gamma: linear = (srgb / 255)^2.2
 */
function toLinear(byte) {
  const s = byte / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Compute per-channel linear luminance from RGBA bytes.
 * Returns a Float64Array of length pixelCount.
 */
function luminance(rgba, width, height) {
  const n = width * height;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = toLinear(rgba[i * 4]);
    const g = toLinear(rgba[i * 4 + 1]);
    const b = toLinear(rgba[i * 4 + 2]);
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return lum;
}

/**
 * Per-pixel max absolute difference across RGB channels (linear space).
 * Returns { maxDelta, maxPixelIndex, perChannelMax: [rMax, gMax, bMax] }
 */
export function maxPixelDelta(rgbaA, rgbaB, width, height) {
  const n = width * height;
  let maxDelta = 0;
  let maxPixelIndex = 0;
  const perChannelMax = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const a = toLinear(rgbaA[i * 4 + c]);
      const b = toLinear(rgbaB[i * 4 + c]);
      const d = Math.abs(a - b);
      if (d > perChannelMax[c]) perChannelMax[c] = d;
      if (d > maxDelta) {
        maxDelta = d;
        maxPixelIndex = i;
      }
    }
  }

  return { maxDelta, maxPixelIndex, perChannelMax };
}

/**
 * Mean Squared Error over all RGB channels in linear space.
 */
export function mse(rgbaA, rgbaB, width, height) {
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const a = toLinear(rgbaA[i * 4 + c]);
      const b = toLinear(rgbaB[i * 4 + c]);
      const d = a - b;
      sum += d * d;
    }
  }
  return sum / (n * 3);
}

/**
 * Peak Signal-to-Noise Ratio in dB.
 * PSNR = 10 * log10(1 / MSE)  (max possible linear value is 1.0)
 */
export function psnr(rgbaA, rgbaB, width, height) {
  const err = mse(rgbaA, rgbaB, width, height);
  if (err === 0) return Infinity;
  return 10 * Math.log10(1 / err);
}

/**
 * Structural Similarity Index (SSIM) — luminance-only, single-window.
 *
 * Uses a simplified 8×8 sliding window over luminance channels.
 * Returns a value in [-1, 1] where 1 = identical.
 *
 * Constants per the original Wang et al. 2004 paper:
 *   C1 = (0.01 * L)^2,  C2 = (0.03 * L)^2,  L = 1.0 (dynamic range)
 */
export function ssim(rgbaA, rgbaB, width, height) {
  const L = 1.0;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;

  const lumA = luminance(rgbaA, width, height);
  const lumB = luminance(rgbaB, width, height);

  const winSize = 8;
  let ssimSum = 0;
  let winCount = 0;

  for (let y = 0; y <= height - winSize; y += winSize) {
    for (let x = 0; x <= width - winSize; x += winSize) {
      let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
      const pixels = winSize * winSize;

      for (let dy = 0; dy < winSize; dy++) {
        for (let dx = 0; dx < winSize; dx++) {
          const idx = (y + dy) * width + (x + dx);
          const a = lumA[idx];
          const b = lumB[idx];
          sumA += a;
          sumB += b;
          sumA2 += a * a;
          sumB2 += b * b;
          sumAB += a * b;
        }
      }

      const muA = sumA / pixels;
      const muB = sumB / pixels;
      const sigmaA2 = sumA2 / pixels - muA * muA;
      const sigmaB2 = sumB2 / pixels - muB * muB;
      const sigmaAB = sumAB / pixels - muA * muB;

      const numerator = (2 * muA * muB + C1) * (2 * sigmaAB + C2);
      const denominator = (muA * muA + muB * muB + C1) * (sigmaA2 + sigmaB2 + C2);

      ssimSum += numerator / denominator;
      winCount++;
    }
  }

  return winCount > 0 ? ssimSum / winCount : 1.0;
}

/**
 * Evaluate all comparison metrics and apply thresholds.
 *
 * @param {Uint8Array|Uint8ClampedArray} rgbaA — first image RGBA
 * @param {Uint8Array|Uint8ClampedArray} rgbaB — second image RGBA
 * @param {number} width
 * @param {number} height
 * @param {{ maxPixelDelta?: number, mse?: number, ssim?: number }} thresholds
 * @returns {{ maxPixelDelta: object, mse: number, psnr: number, ssim: number, status: string }}
 */
export function compareImages(rgbaA, rgbaB, width, height, thresholds = {}) {
  const maxDelta = maxPixelDelta(rgbaA, rgbaB, width, height);
  const errMse = mse(rgbaA, rgbaB, width, height);
  const errPsnr = psnr(rgbaA, rgbaB, width, height);
  const errSsim = ssim(rgbaA, rgbaB, width, height);

  const epsDelta = thresholds.maxPixelDelta ?? 0.01;
  const epsMse = thresholds.mse ?? 0.0001;
  const epsSsim = thresholds.ssim ?? 0.99;

  const pass =
    maxDelta.maxDelta <= epsDelta &&
    errMse <= epsMse &&
    errSsim >= epsSsim;

  return {
    maxPixelDelta: maxDelta.maxDelta,
    perChannelMax: maxDelta.perChannelMax,
    mse: errMse,
    psnr: errPsnr,
    ssim: errSsim,
    status: pass ? "pass" : "fail",
  };
}
