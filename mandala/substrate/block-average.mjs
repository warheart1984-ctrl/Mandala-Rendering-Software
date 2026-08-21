/**
 * B_L — named block-average stages from UV lattice → IR frame.
 *
 * Status: **partial**
 *   - Real operators: spp arithmetic mean + box downsample.
 *   - Maps existing RT4D samplesPerPixel / width / height.
 *   - TAA, temporal accumulation, denoise: **do not exist** on this CPU path.
 *   - UV is not a hyper-dense RHFD sim. IR is the output raster.
 *   - Möbius torus coarse-graining is this downsample, not a toroidal FFT.
 */

export const BLOCK_AVERAGE = {
  id: "B_L",
  status: "partial",
  stages: {
    UV: {
      name: "UV",
      rhfd: "hyper-dense internal sim",
      moebius: "hex lattice microstructure",
      mapsTo: [
        "hex dual-lattice cells (mandala/substrate/dual-lattice.mjs)",
        "PathTracer4D.samplesPerPixel (internal samples before mean)",
        "optional uvWidth/uvHeight before downsample",
      ],
      note: "Not a hyper-dense RHFD continuum. Hex radius 2–3 for CPU tests.",
    },
    B_L: {
      name: "B_L",
      rhfd: "block averaging",
      moebius: "toroidal coarse-graining (named; implementation is box/spp)",
      mapsTo: ["spp arithmetic mean", "box downsample"],
      taa: false,
      denoise: false,
      temporalAccumulation: false,
    },
    IR: {
      name: "IR",
      rhfd: "observed frame",
      moebius: "torus macro curvature / displayed plate",
      mapsTo: [
        "output width/height",
        "render-still.mjs toByte Reinhard + gamma 2.2",
      ],
      motionBlur: false,
    },
  },
  rt4d: {
    samplesPerPixel: "B_L spp stage",
    width: "IR unless uvWidth set",
    height: "IR unless uvHeight set",
  },
};

/**
 * Arithmetic mean of sample values (RT4D spp analogue).
 * @param {number[]} samples
 */
export function sppMean(samples) {
  if (!samples.length) return 0;
  let s = 0;
  for (const v of samples) s += v;
  return s / samples.length;
}

/**
 * Box-filter downsample of a packed float buffer (1 or 4 channels).
 * @param {Float32Array|number[]} src
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} dstW
 * @param {number} dstH
 * @param {number} [channels=1]
 */
export function boxDownsample(src, srcW, srcH, dstW, dstH, channels = 1) {
  if (dstW > srcW || dstH > srcH) {
    throw new Error("boxDownsample is B_L (coarse-grain), not upsample");
  }
  const dst = new Float32Array(dstW * dstH * channels);
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor((y * srcH) / dstH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor((x * srcW) / dstW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / dstW));
      for (let c = 0; c < channels; c++) {
        let acc = 0;
        let n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            acc += src[(yy * srcW + xx) * channels + c];
            n++;
          }
        }
        dst[(y * dstW + x) * channels + c] = n ? acc / n : 0;
      }
    }
  }
  return dst;
}

/**
 * Name a render call as UV → B_L → IR without inventing TAA.
 */
export function describeRenderPipeline({
  uvWidth,
  uvHeight,
  irWidth,
  irHeight,
  samples = 1,
} = {}) {
  const sameRes = uvWidth === irWidth && uvHeight === irHeight;
  return {
    UV: { width: uvWidth, height: uvHeight, samples, topology: "hex microstructure" },
    B_L: {
      sppMean: samples,
      boxDownsample: !sameRes,
      taa: false,
      denoise: false,
      status: "partial",
    },
    IR: { width: irWidth, height: irHeight, tonemap: "reinhard+gamma" },
  };
}
