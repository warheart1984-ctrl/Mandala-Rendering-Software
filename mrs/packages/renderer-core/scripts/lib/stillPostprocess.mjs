/**
 * CPU still post-process helpers (bloom + optional vignette).
 * Used by render-still.mjs — not the WebGPU PostProcessor path.
 */

/**
 * Soft bloom on HDR float buffer (RGBA interleaved, length = w*h*4).
 * @param {Float32Array} hdr
 * @param {number} width
 * @param {number} height
 * @param {{ threshold?: number, intensity?: number, radius?: number }} [opts]
 */
export function applyBloom(hdr, width, height, opts = {}) {
  const threshold = opts.threshold ?? 0.8;
  const intensity = opts.intensity ?? 0.3;
  const radius = Math.max(1, Math.round(opts.radius ?? 2));
  if (!(intensity > 0) || width < 2 || height < 2) return hdr;

  const bright = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const lum = 0.2126 * hdr[o] + 0.7152 * hdr[o + 1] + 0.0722 * hdr[o + 2];
    if (lum > threshold) {
      const t = (lum - threshold) / Math.max(1e-6, lum);
      bright[o] = hdr[o] * t;
      bright[o + 1] = hdr[o + 1] * t;
      bright[o + 2] = hdr[o + 2] * t;
    }
  }

  const blurred = boxBlurSeparable(bright, width, height, radius);
  for (let i = 0; i < hdr.length; i++) {
    hdr[i] += blurred[i] * intensity;
  }
  return hdr;
}

/**
 * Subtle vignette on byte RGBA buffer.
 * @param {Buffer|Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ radius?: number, softness?: number }} [opts]
 */
export function applyVignette(rgba, width, height, opts = {}) {
  const radius = opts.radius ?? 0.9;
  const softness = opts.softness ?? 0.35;
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxR = Math.sqrt(cx * cx + cy * cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const d = Math.sqrt(dx * dx + dy * dy);
      let v = 1;
      if (d > radius) {
        const t = Math.min(1, (d - radius) / Math.max(1e-6, softness));
        v = 1 - 0.45 * t * t;
      }
      const o = (y * width + x) * 4;
      rgba[o] = Math.min(255, Math.max(0, Math.round(rgba[o] * v)));
      rgba[o + 1] = Math.min(255, Math.max(0, Math.round(rgba[o + 1] * v)));
      rgba[o + 2] = Math.min(255, Math.max(0, Math.round(rgba[o + 2] * v)));
    }
  }
  return rgba;
}

function boxBlurSeparable(src, width, height, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const w = radius * 2 + 1;

  // Horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        const o = (y * width + xx) * 4;
        r += src[o];
        g += src[o + 1];
        b += src[o + 2];
      }
      const d = (y * width + x) * 4;
      tmp[d] = r / w;
      tmp[d + 1] = g / w;
      tmp[d + 2] = b / w;
    }
  }

  // Vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        const o = (yy * width + x) * 4;
        r += tmp[o];
        g += tmp[o + 1];
        b += tmp[o + 2];
      }
      const d = (y * width + x) * 4;
      out[d] = r / w;
      out[d + 1] = g / w;
      out[d + 2] = b / w;
    }
  }
  return out;
}
