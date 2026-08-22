/**
 * quantize.mjs — OPTIONAL, deterministic, LOSSY color reduction for the CPF layer.
 *
 * This is deliberately kept SEPARATE from the lossless CPO codec (`cpo.mjs`). The
 * lossless path guarantees exact RGBA round-trip for images already within their
 * palette. When an arbitrary photographic image has too many distinct colors for a
 * useful indexed grid, a caller may first reduce colors HERE, then feed the result
 * to `encodeCPO`. After quantization the round-trip reproduces the *quantized*
 * pixels exactly (it is lossless w.r.t. the quantized buffer), but NOT the original
 * — hence "lossy". Callers must treat quantized output as a distinct source.
 *
 * The only quantizer implemented is uniform per-channel bit-depth reduction, which
 * is trivially deterministic and platform-independent. Median-cut / k-means style
 * palettes are FUTURE work (status: declared) — they would add non-trivial code and
 * tie-break subtleties, and are not required for the lossless core.
 *
 * Determinism: pure function of input bytes + params. No Math.random, no Date.now.
 */

/**
 * Reduce each channel to `bits` bits (1..8) by keeping the top bits and
 * replicating them into the low bits (so 0 stays 0 and 255 stays 255).
 * @param {Buffer|Uint8Array} rgba
 * @param {{ bits?:number, quantizeAlpha?:boolean }} [opts]
 * @returns {{ rgba:Buffer, lossy:true, method:string, bits:number }}
 */
export function quantizeRgbaBitDepth(rgba, opts = {}) {
  const bits = opts.bits ?? 4;
  if (!Number.isInteger(bits) || bits < 1 || bits > 8) {
    throw new Error(`quantizeRgbaBitDepth: bits must be an integer in [1,8], got ${bits}`);
  }
  const quantizeAlpha = opts.quantizeAlpha ?? false;
  const out = Buffer.alloc(rgba.length);
  const drop = 8 - bits;
  const reduce = (v) => {
    if (bits === 8) return v;
    const top = v >> drop; // keep the high `bits`
    // Replicate high bits down so the reduced value spans the full [0,255] range.
    let r = top;
    let filled = bits;
    while (filled < 8) {
      r = (r << bits) | top;
      filled += bits;
    }
    return (r >> (filled - 8)) & 255;
  };
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = reduce(rgba[i]);
    out[i + 1] = reduce(rgba[i + 1]);
    out[i + 2] = reduce(rgba[i + 2]);
    out[i + 3] = quantizeAlpha ? reduce(rgba[i + 3]) : rgba[i + 3];
  }
  return { rgba: out, lossy: true, method: "uniform-bit-depth", bits };
}
