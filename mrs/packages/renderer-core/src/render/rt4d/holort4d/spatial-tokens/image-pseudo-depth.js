/**
 * Partial grayscale→pseudo-depth heuristic (Sobel / luminance).
 * NOT photoreal metric depth. Status: partial.
 *
 * Prefer chamber opticalLength / landmark-z Float32 grids for enforced tokenize.
 */

/**
 * @param {Uint8Array|Uint8ClampedArray} rgba  RGBA bytes
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} pseudo-depth in [0,1]
 */
export function grayscalePseudoDepth(rgba, width, height) {
  const n = width * height;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
  }
  // Invert: brighter ≈ nearer (common monocular heuristic — partial, not metric)
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) depth[i] = 1 - gray[i];
  return depth;
}

export const IMAGE_PSEUDO_DEPTH_STATUS = Object.freeze({
  path: "partial",
  note: "Luminance invert only. Not ML, not photoreal metric depth. Declared for true photo→depth.",
});
