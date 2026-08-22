/**
 * Boundary reconstruction — EGT_t → approximate bulk B̂_t (Claim A).
 *
 * Status: **partial** — toy inverse map from ρ peaks / w clusters / K.
 * Not certified bulk rebuild; not AdS/CFT / RT reconstruction.
 */

export const RECONSTRUCT_STATUS = "partial";
export const RECONSTRUCT_CLAIM =
  "Claim A only — approximate B̂ from EGT; not certified interior";

/**
 * Peaks in ρ → candidate bulk energy concentrations.
 * @param {object} egt
 * @param {{ minFraction?: number, maxPeaks?: number, absoluteMin?: number }} [opts]
 */
export function findRhoPeaks(egt, opts = {}) {
  const rho = egt.rho;
  let maxRho = 0;
  for (let i = 0; i < rho.length; i++) {
    if (rho[i] > maxRho) maxRho = rho[i];
  }
  const minFraction = opts.minFraction ?? 0.5;
  const absoluteMin = opts.absoluteMin ?? 1e-12;
  const thresh = Math.max(absoluteMin, maxRho * minFraction);
  const maxPeaks = Math.max(1, opts.maxPeaks ?? 64);

  const peaks = [];
  for (let i = 0; i < rho.length; i++) {
    if (rho[i] >= thresh) {
      const node = egt.nodes[i];
      peaks.push({
        nodeId: i,
        rho: rho[i],
        K: egt.K?.[i] ?? 0,
        position: {
          x: node.position?.x ?? node.x ?? 0,
          y: node.position?.y ?? node.y ?? 0,
          z: node.position?.z ?? 0,
        },
      });
    }
  }
  peaks.sort((a, b) => b.rho - a.rho);
  return {
    maxRho,
    thresh,
    peaks: peaks.slice(0, maxPeaks),
  };
}

/**
 * Strong w_ij clusters → candidate interaction regions (edge midpoints).
 * @param {object} egt
 * @param {{ minFraction?: number, maxClusters?: number }} [opts]
 */
export function findStrongEdgeClusters(egt, opts = {}) {
  let maxW = 0;
  for (const e of egt.edges) {
    if (e.w_ij > maxW) maxW = e.w_ij;
  }
  const minFraction = opts.minFraction ?? 0.6;
  const thresh = maxW * minFraction;
  const maxClusters = Math.max(1, opts.maxClusters ?? 32);
  const clusters = [];
  for (const e of egt.edges) {
    if (e.w_ij < thresh || e.w_ij <= 0) continue;
    const a = egt.nodes[e.i];
    const b = egt.nodes[e.j];
    const ax = a.position?.x ?? a.x ?? 0;
    const ay = a.position?.y ?? a.y ?? 0;
    const az = a.position?.z ?? 0;
    const bx = b.position?.x ?? b.x ?? 0;
    const by = b.position?.y ?? b.y ?? 0;
    const bz = b.position?.z ?? 0;
    clusters.push({
      i: e.i,
      j: e.j,
      w_ij: e.w_ij,
      amplitude: e.w_ij,
      midpoint: {
        x: 0.5 * (ax + bx),
        y: 0.5 * (ay + by),
        z: 0.5 * (az + bz),
      },
    });
  }
  clusters.sort((a, b) => b.w_ij - a.w_ij);
  return {
    maxW,
    thresh,
    clusters: clusters.slice(0, maxClusters),
  };
}

/**
 * Lift a boundary peak to 4D: (x,y,z) from node + frame t.
 * @param {{ position: { x:number,y:number,z:number }, rho?: number, K?: number, nodeId?: number }} peak
 * @param {number} t
 */
export function liftPeakTo4D(peak, t) {
  return {
    t,
    x: peak.position.x,
    y: peak.position.y,
    z: peak.position.z,
    rho: peak.rho ?? 0,
    K: peak.K ?? 0,
    nodeId: peak.nodeId,
    asArray: Float64Array.from([t, peak.position.x, peak.position.y, peak.position.z]),
  };
}

/**
 * Inverse map EGT_t → B̂_t (approximate bulk features).
 *
 * @param {object} egt
 * @param {{
 *   t?: number,
 *   minFraction?: number,
 *   maxPeaks?: number,
 * }} [opts]
 */
export function reconstructBulkFromEGT(egt, opts = {}) {
  const t = opts.t != null ? opts.t : egt.t ?? 0;
  const peakInfo = findRhoPeaks(egt, opts);
  const edgeInfo = findStrongEdgeClusters(egt, opts);
  const points = peakInfo.peaks.map((p) => liftPeakTo4D(p, t));

  // Primary estimate: highest-ρ peak as bulk energy locus at this t
  const primary = points[0] || {
    t,
    x: 0,
    y: 0,
    z: 0,
    rho: 0,
    K: 0,
    nodeId: -1,
    asArray: Float64Array.from([t, 0, 0, 0]),
  };

  let maxAbsK = 0;
  if (egt.K) {
    for (let i = 0; i < egt.K.length; i++) {
      const a = Math.abs(egt.K[i]);
      if (a > maxAbsK) maxAbsK = a;
    }
  }

  return {
    kind: "approximate-bulk-from-egt",
    status: RECONSTRUCT_STATUS,
    claim: RECONSTRUCT_CLAIM,
    t,
    primary,
    points,
    interactionRegions: edgeInfo.clusters.map((c) => ({
      ...c,
      t,
      note: "w_ij cluster → interaction amplitude proxy",
    })),
    curvatureProxy: {
      maxAbsK,
      note: "K from EGT — geometric distortion candidate only",
    },
    features: {
      peakCount: peakInfo.peaks.length,
      maxRho: peakInfo.maxRho,
      strongEdgeCount: edgeInfo.clusters.length,
      maxW: edgeInfo.maxW,
    },
    honesty: "partial/toy — not certified bulk; Claim A only",
  };
}

/**
 * Euclidean spatial distance between reconstructed and true 4D points (ignore Δt).
 * @param {{ x:number,y:number,z:number }} a
 * @param {{ x:number,y:number,z:number }} b
 */
export function spatialDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Compare reconstructed primary loci to true worldline samples.
 *
 * @param {{ t:number,x:number,y:number,z:number }[]} hatSamples — one B̂ primary per frame
 * @param {{ t:number,x:number,y:number,z:number }[]} trueTrack
 * @returns {{ meanError: number, maxError: number, rmsError: number, n: number, errors: number[] }}
 */
export function worldlinePositionError(hatSamples, trueTrack) {
  const byT = new Map();
  for (const p of trueTrack) {
    byT.set(p.t, p);
  }
  const errors = [];
  for (const h of hatSamples) {
    const truth = byT.get(h.t);
    if (!truth) continue;
    errors.push(spatialDistance(h, truth));
  }
  if (!errors.length) {
    return { meanError: Infinity, maxError: Infinity, rmsError: Infinity, n: 0, errors: [] };
  }
  let sum = 0;
  let sumSq = 0;
  let maxError = 0;
  for (const e of errors) {
    sum += e;
    sumSq += e * e;
    if (e > maxError) maxError = e;
  }
  const n = errors.length;
  return {
    meanError: sum / n,
    maxError,
    rmsError: Math.sqrt(sumSq / n),
    n,
    errors,
  };
}

/**
 * Per-frame reconstruct from live EGT peak vs true p4 (tiny-scene path).
 *
 * @param {object} egt
 * @param {{ t:number,x:number,y:number,z:number }} trueP4
 * @param {{ t?: number }} [opts]
 */
export function reconstructFrameScore(egt, trueP4, opts = {}) {
  const bulkHat = reconstructBulkFromEGT(egt, { t: opts.t ?? trueP4.t, ...opts });
  const err = spatialDistance(bulkHat.primary, trueP4);
  return {
    bulkHat,
    positionError: err,
    primary: bulkHat.primary,
  };
}

/**
 * Default tolerance for tiny-scene trail: ~1.5 grid cells on a 10×10 / 32² plane.
 * @param {{ sizeX?: number, resolutionX?: number }} [grid]
 */
export function defaultTinySceneTolerance(grid = {}) {
  const sizeX = grid.sizeX ?? 10;
  const resolutionX = Math.max(2, grid.resolutionX ?? 32);
  const cell = sizeX / (resolutionX - 1);
  return cell * 1.5;
}

/**
 * Approximate bulk B̂ from plane EGT + true worldline track (tiny / interference).
 *
 * Lifts per-frame deposit nodes and global ρ peaks to 4D; scores position error
 * vs true track. Honest **partial** — not certified bulk rebuild.
 *
 * @param {object} egt
 * @param {{ t:number,x:number,y:number,z:number }[]} trueTrack
 * @param {{ t:number, nearestId:number }[]} [framePeaks]
 * @param {{ tolerance?: number }} [opts]
 */
export function reconstructApproximateBulk(egt, trueTrack, framePeaks = [], opts = {}) {
  const byT = new Map();
  for (const p of trueTrack) byT.set(p.t, p);

  const hatWorldline = [];
  const errors = [];
  for (const fp of framePeaks) {
    const node = egt.nodes[fp.nearestId];
    if (!node) continue;
    const hat = {
      t: fp.t,
      x: node.position.x,
      y: node.position.y,
      z: node.position.z,
      nodeId: fp.nearestId,
      rho: egt.rho[fp.nearestId] ?? 0,
    };
    hatWorldline.push(hat);
    const truth = byT.get(fp.t);
    if (truth) errors.push(spatialDistance(hat, truth));
  }

  // Also score global ρ peaks lifted with egt.t / nearest track time
  const peakInfo = findRhoPeaks(egt, { minFraction: 0.55, maxPeaks: 16 });
  const liftedPeaks = peakInfo.peaks.map((p) => liftPeakTo4D(p, egt.t ?? 0));
  let maxRhoPeakDist = 0;
  for (const lp of liftedPeaks) {
    let best = Infinity;
    for (const tr of trueTrack) {
      const d = spatialDistance(lp, tr);
      if (d < best) best = d;
    }
    if (Number.isFinite(best) && best > maxRhoPeakDist) maxRhoPeakDist = best;
  }

  const edgeInfo = findStrongEdgeClusters(egt, { minFraction: 0.5 });
  let maxAbsK = 0;
  let sumAbsK = 0;
  if (egt.K) {
    for (let i = 0; i < egt.K.length; i++) {
      const a = Math.abs(egt.K[i]);
      sumAbsK += a;
      if (a > maxAbsK) maxAbsK = a;
    }
  }

  let meanError = 0;
  let maxWorldlineError = 0;
  let rmsError = 0;
  if (errors.length) {
    let sum = 0;
    let sumSq = 0;
    for (const e of errors) {
      sum += e;
      sumSq += e * e;
      if (e > maxWorldlineError) maxWorldlineError = e;
    }
    meanError = sum / errors.length;
    rmsError = Math.sqrt(sumSq / errors.length);
  }

  const cellTol =
    opts.tolerance ??
    defaultTinySceneTolerance({
      sizeX: egt.plane?.sizeX ?? 10,
      resolutionX: egt.shape?.nx ?? 32,
    });

  // Field amplitude proxy: mean ρ on trail nodes vs 1 deposit/frame expectation
  let trailRho = 0;
  const seen = new Set();
  for (const fp of framePeaks) {
    if (seen.has(fp.nearestId)) continue;
    seen.add(fp.nearestId);
    trailRho += egt.rho[fp.nearestId] ?? 0;
  }
  const expectedAmp = Math.max(1, framePeaks.length);
  const fieldAmplitudeError =
    expectedAmp > 0 ? Math.abs(trailRho - expectedAmp) / expectedAmp : 0;

  // Curvature mismatch proxy: trail should carry most |K| mass
  let trailK = 0;
  for (const id of seen) trailK += Math.abs(egt.K[id] ?? 0);
  const curvatureMismatch =
    sumAbsK > 1e-12 ? 1 - Math.min(1, trailK / sumAbsK) : 0;

  const bulkHat = reconstructBulkFromEGT(egt, { t: egt.t ?? 0 });

  const metrics = {
    reconstructionError: meanError,
    meanPositionError: meanError,
    maxWorldlineError,
    rmsPositionError: rmsError,
    maxRhoPeakDist,
    fieldAmplitudeError,
    curvatureMismatch,
    n: errors.length,
    tolerance: cellTol,
    withinTolerance: meanError <= cellTol && errors.length > 0,
  };

  return {
    kind: "approximate-bulk-reconstruction",
    status: RECONSTRUCT_STATUS,
    claim: RECONSTRUCT_CLAIM,
    honesty: "partial/toy — not certified bulk; Claim A only",
    bulkHat,
    guess: bulkHat,
    hatWorldline,
    worldline: { samples: hatWorldline, count: hatWorldline.length },
    liftedPeaks,
    interactionRegions: edgeInfo.clusters,
    metrics,
    receiptFields: {
      reconstructionError: metrics.reconstructionError,
      maxWorldlineError: metrics.maxWorldlineError,
      maxRhoPeakDist: metrics.maxRhoPeakDist,
      fieldAmplitudeError: metrics.fieldAmplitudeError,
      curvatureMismatch: metrics.curvatureMismatch,
    },
  };
}

/** Alias used by docs / older call sites */
export const reconstruct = reconstructApproximateBulk;

/** Feature bag for Stewardship / console (alias over findRhoPeaks + clusters). */
export function extractEGTFeatures(egt, opts = {}) {
  const peakInfo = findRhoPeaks(egt, opts);
  const edgeInfo = findStrongEdgeClusters(egt, opts);
  let maxAbsK = 0;
  if (egt.K) {
    for (let i = 0; i < egt.K.length; i++) {
      const a = Math.abs(egt.K[i]);
      if (a > maxAbsK) maxAbsK = a;
    }
  }
  return {
    status: RECONSTRUCT_STATUS,
    maxRho: peakInfo.maxRho,
    maxW: edgeInfo.maxW,
    maxAbsK,
    rhoPeaks: peakInfo.peaks.map((p) => ({
      id: p.nodeId,
      rho: p.rho,
      K: p.K,
      position: p.position,
    })),
    strongEdges: edgeInfo.clusters,
    clusters: edgeInfo.clusters.map((c) => ({
      size: 2,
      weightSum: c.w_ij,
      amplitude: c.amplitude,
      centroid: c.midpoint,
    })),
    kHotspots: peakInfo.peaks
      .map((p) => ({
        id: p.nodeId,
        K: p.K,
        absK: Math.abs(p.K),
        position: p.position,
      }))
      .sort((a, b) => b.absK - a.absK)
      .slice(0, opts.maxPeaks ?? 8),
  };
}

/** Lift features → B̂ primary (alias of reconstructBulkFromEGT). */
export function liftEGTToBulkGuess(egt, opts = {}) {
  const hat = reconstructBulkFromEGT(egt, opts);
  return {
    ...hat,
    primary: {
      t: hat.primary.t,
      x: hat.primary.x,
      y: hat.primary.y,
      z: hat.primary.z,
      amplitude: hat.primary.rho,
      K: hat.primary.K,
      source: "rho-peak",
    },
    energyConcentrations: hat.points.map((p) => ({
      t: p.t,
      x: p.x,
      y: p.y,
      z: p.z,
      amplitude: p.rho,
      K: p.K,
      source: "rho-peak",
    })),
  };
}

/** Worldline samples from framePeaks (or primary peak fallback). */
export function reconstructWorldlineFromEGT(egt, opts = {}) {
  const framePeaks = opts.framePeaks || [];
  if (framePeaks.length) {
    const samples = [];
    for (const fp of framePeaks) {
      const n = egt.nodes[fp.nearestId];
      if (!n) continue;
      samples.push({
        t: fp.t,
        x: n.position.x,
        y: n.position.y,
        z: n.position.z,
        amplitude: egt.rho[fp.nearestId],
        source: "frame-deposit-nearest",
      });
    }
    return { status: RECONSTRUCT_STATUS, claim: RECONSTRUCT_CLAIM, samples, count: samples.length };
  }
  const hat = reconstructBulkFromEGT(egt, { t: opts.t ?? egt.t });
  const samples = [
    {
      t: hat.primary.t,
      x: hat.primary.x,
      y: hat.primary.y,
      z: hat.primary.z,
      amplitude: hat.primary.rho,
      source: "rho-peak",
    },
  ];
  return { status: RECONSTRUCT_STATUS, claim: RECONSTRUCT_CLAIM, samples, count: samples.length };
}

/** Compare reconstructed samples to true track (metrics bag). */
export function compareReconstruction(reconstructed, trueTrack, opts = {}) {
  const full = reconstructApproximateBulk(
    opts.egt || { nodes: [], rho: [], K: [], edges: [], t: 0 },
    trueTrack,
    (reconstructed.samples || []).map((s) => ({
      t: s.t,
      nearestId: s.nodeId ?? 0,
    })),
  );
  // Prefer direct worldlinePositionError when we have spatial samples
  const pos = worldlinePositionError(reconstructed.samples || [], trueTrack);
  let maxRhoPeakDist = 0;
  if (opts.egt && trueTrack.length) {
    const again = reconstructApproximateBulk(opts.egt, trueTrack, opts.framePeaks || []);
    maxRhoPeakDist = again.metrics.maxRhoPeakDist;
    return {
      status: RECONSTRUCT_STATUS,
      claim: RECONSTRUCT_CLAIM,
      reconstructionError: pos.meanError,
      meanWorldlineError: pos.meanError,
      maxWorldlineError: pos.maxError,
      maxRhoPeakDist,
      fieldAmplitudeError: again.metrics.fieldAmplitudeError,
      curvatureMismatch: again.metrics.curvatureMismatch,
      sampleCount: pos.n,
      bounded: Number.isFinite(pos.meanError),
      note: "Partial PoC metrics — not certified bulk equality",
    };
  }
  void full;
  return {
    status: RECONSTRUCT_STATUS,
    claim: RECONSTRUCT_CLAIM,
    reconstructionError: pos.meanError,
    meanWorldlineError: pos.meanError,
    maxWorldlineError: pos.maxError,
    maxRhoPeakDist,
    fieldAmplitudeError: 0,
    curvatureMismatch: 0,
    sampleCount: pos.n,
    bounded: Number.isFinite(pos.meanError),
    note: "Partial PoC metrics — not certified bulk equality",
  };
}
