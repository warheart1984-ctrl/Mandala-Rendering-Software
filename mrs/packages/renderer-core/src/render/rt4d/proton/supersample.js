/**
 * Proton HQ supersample helpers (CPU).
 *
 * STATUS: **enforced** — renderDims + deterministic box downsample.
 * No GPU. No PRNG.
 *
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 */

/**
 * Render dimensions after supersample factor.
 *
 * STATUS: **enforced**
 *
 * @param {number} w
 * @param {number} h
 * @param {number} ss
 * @returns {{ width: number, height: number, supersample: number }}
 */
export function renderDims(w, h, ss) {
  const supersample = Math.max(1, Math.floor(Number(ss) || 1));
  const width = Math.max(1, Math.floor(Number(w) || 1));
  const height = Math.max(1, Math.floor(Number(h) || 1));
  return {
    width: width * supersample,
    height: height * supersample,
    supersample,
  };
}

/**
 * Box-downsample a planar buffer (channels interleaved) from srcW×srcH → dstW×dstH.
 * Averages each destination pixel over its covering source rectangle.
 *
 * STATUS: **enforced**
 *
 * @param {Float32Array|number[]} src
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} dstW
 * @param {number} dstH
 * @param {number} [channels=4]
 * @returns {Float32Array}
 */
export function downsampleBox(src, srcW, srcH, dstW, dstH, channels = 4) {
  const sw = Math.max(1, Math.floor(Number(srcW) || 1));
  const sh = Math.max(1, Math.floor(Number(srcH) || 1));
  const dw = Math.max(1, Math.floor(Number(dstW) || 1));
  const dh = Math.max(1, Math.floor(Number(dstH) || 1));
  const ch = Math.max(1, Math.floor(Number(channels) || 1));

  if (!src || src.length < sw * sh * ch) {
    throw new Error("downsampleBox: source buffer too short");
  }

  if (sw === dw && sh === dh) {
    return src instanceof Float32Array ? src : Float32Array.from(src);
  }

  const out = new Float32Array(dw * dh * ch);
  const scaleX = sw / dw;
  const scaleY = sh / dh;

  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    const yEnd = Math.min(sh, y1);
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
      const xEnd = Math.min(sw, x1);
      const count = (xEnd - x0) * (yEnd - y0);
      if (count <= 0) continue;
      const destBase = (y * dw + x) * ch;
      for (let c = 0; c < ch; c++) {
        let sum = 0;
        for (let sy = y0; sy < yEnd; sy++) {
          for (let sx = x0; sx < xEnd; sx++) {
            sum += Number(src[(sy * sw + sx) * ch + c]) || 0;
          }
        }
        out[destBase + c] = sum / count;
      }
    }
  }
  return out;
}
