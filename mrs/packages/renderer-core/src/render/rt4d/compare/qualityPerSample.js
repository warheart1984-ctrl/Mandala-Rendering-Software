/**
 * Quality-per-sample ladder for Digital Printer CPU SoT.
 *
 * STATUS: **enforced** (unit tests) — measures MSE vs highest-spp reference;
 * does not claim free Monte Carlo lunch (more spp → lower MSE is expected).
 */

/**
 * Mean squared error over RGB channels (alpha ignored), normalized to [0,1]^2 scale.
 * @param {Uint8ClampedArray|Uint8Array} a
 * @param {Uint8ClampedArray|Uint8Array} b
 * @param {number} width
 * @param {number} height
 */
export function mseRgba(a, b, width, height) {
  const n = width * height;
  if (a.length < n * 4 || b.length < n * 4) {
    throw new Error("mseRgba: buffer shorter than width*height*4");
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const dr = (a[o] - b[o]) / 255;
    const dg = (a[o + 1] - b[o + 1]) / 255;
    const db = (a[o + 2] - b[o + 2]) / 255;
    sum += dr * dr + dg * dg + db * db;
  }
  return sum / (n * 3);
}

/**
 * Build a quality-per-sample ladder from beauty plates at increasing spp.
 * Reference = plate with maximum spp. qualityPerSample = ΔMSE / Δspp vs previous rung
 * (how much MSE drops per additional sample — higher is better spend).
 *
 * @param {Array<{ spp: number, rgba: Uint8Array|Uint8ClampedArray, width: number, height: number }>} plates
 * @returns {Array<{ spp: number, mseToReference: number, qualityPerSample: number|null, statusTag: string }>}
 */
export function qualityPerSampleLadder(plates) {
  if (!Array.isArray(plates) || plates.length < 2) {
    throw new Error("qualityPerSampleLadder: need at least 2 plates");
  }
  const sorted = [...plates].sort((x, y) => x.spp - y.spp);
  const ref = sorted[sorted.length - 1];
  const { width, height } = ref;
  for (const p of sorted) {
    if (p.width !== width || p.height !== height) {
      throw new Error("qualityPerSampleLadder: all plates must share dims");
    }
  }

  const rows = [];
  let prevMse = null;
  let prevSpp = null;
  for (const p of sorted) {
    const mseToReference = mseRgba(p.rgba, ref.rgba, width, height);
    let qualityPerSample = null;
    if (prevMse != null && p.spp > prevSpp) {
      const drop = prevMse - mseToReference;
      qualityPerSample = drop / (p.spp - prevSpp);
    }
    rows.push({
      spp: p.spp,
      mseToReference,
      qualityPerSample,
      statusTag: "enforced",
    });
    prevMse = mseToReference;
    prevSpp = p.spp;
  }
  return rows;
}
