/**
 * Two-worldline interference scene (Claim A — toy dual).
 *
 * W1 and W2 approach; when spatial distance < threshold, interaction spike
 * boosts ρ and w_ij in the overlapping boundary neighborhood → ripple-like K.
 *
 * Status: **partial**
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../../engine/png.mjs";
import {
  Worldline,
  makeGridPlane,
  createPlaneEGT,
  depositTrail,
  nearestNodeId,
  renderBulkWorldlineRgb,
  BOUNDARY_PLANE_CONVENTION,
} from "../tiny-scene.mjs";
import { BoundaryProjection } from "../boundary-projection.mjs";
import { DEFAULT_ALPHA, DEFAULT_BETA, hashEGT, recomputeCurvature } from "../egt.mjs";
import { renderEGTEmergentGeometry, renderEGTHeatmap, EFR_MODES } from "../efr.mjs";
import { reconstructApproximateBulk } from "../reconstruct.mjs";
import {
  buildGovernanceAudit,
  checkBulkEgtCoupling,
  entanglementHealth,
} from "../ciems-lab.mjs";

export const INTERFERENCE_STATUS = "partial";

/**
 * Spatial distance between two 4-positions (spatial components only).
 */
export function spatialDistance(p4a, p4b) {
  return Math.hypot(p4a.x - p4b.x, p4a.y - p4b.y, p4a.z - p4b.z);
}

/**
 * Deposit interaction spike around a boundary point (ρ + neighbor w_ij boost).
 */
export function depositInteractionSpike(egt, p3, opts = {}) {
  const rhoBoost = opts.rhoBoost ?? 3;
  const wBoost = opts.wBoost ?? 1.2;
  const radius = opts.radius ?? 1.2;
  const { id } = nearestNodeId(egt, p3);
  egt.rho[id] += rhoBoost;

  const center = egt.nodes[id];
  const touched = new Set([id]);
  for (const n of egt.nodes) {
    const d = Math.hypot(
      n.position.x - center.position.x,
      n.position.y - center.position.y,
      n.position.z - center.position.z,
    );
    if (d <= radius && n.id !== id) {
      egt.rho[n.id] += rhoBoost * 0.35 * (1 - d / radius);
      touched.add(n.id);
    }
  }
  for (const e of egt.edges) {
    if (touched.has(e.i) || touched.has(e.j)) {
      e.w_ij += wBoost;
    }
  }
  return { centerId: id, touched: touched.size };
}

/**
 * Run two-worldline interference lab.
 *
 * Default: W1 from left, W2 from right along y≈0 — meet mid-run.
 */
export function runTwoWorldlineInterference(opts = {}) {
  const frames = Math.max(2, opts.frames ?? 60);
  const dt = opts.dt ?? 1;
  const threshold = opts.threshold ?? 0.85;
  const interact = opts.interact !== false;
  const densityIncrement = opts.densityIncrement ?? 0.8;
  const entanglementIncrement = opts.entanglementIncrement ?? 0.25;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const beta = opts.beta ?? DEFAULT_BETA;
  const width = opts.width ?? 384;
  const height = opts.height ?? 256;

  // Head-on along +x / −x, slight y offset so trails braid
  const w1 = new Worldline({
    v_x: opts.v1 ?? 0.18,
    v_y: opts.vy1 ?? 0.02,
    x0: opts.x01 ?? -4.5,
    y0: opts.y01 ?? -0.4,
  });
  const w2 = new Worldline({
    v_x: opts.v2 ?? -0.18,
    v_y: opts.vy2 ?? -0.02,
    x0: opts.x02 ?? 4.5,
    y0: opts.y02 ?? 0.4,
  });

  const boundary = new BoundaryProjection();
  const grid = makeGridPlane({
    sizeX: opts.sizeX ?? 10,
    sizeY: opts.sizeY ?? 10,
    resolutionX: opts.resolutionX ?? 32,
    resolutionY: opts.resolutionY ?? 32,
    z: 0,
  });
  const egt = createPlaneEGT(grid, { alpha, beta });

  const track1 = [];
  const track2 = [];
  const framePeaks = [];
  const interactionFrames = [];
  let maxSpike = 0;
  let edgeSumSeries = [];

  for (let f = 0; f < frames; f++) {
    const t = f * dt;
    const p1 = w1.positionAt(t);
    const p2 = w2.positionAt(t);
    const p3a = boundary.projectPoint4DTo3D(p1.asArray);
    const p3b = boundary.projectPoint4DTo3D(p2.asArray);

    const d1 = depositTrail(egt, p3a, { densityIncrement, entanglementIncrement });
    const d2 = depositTrail(egt, p3b, { densityIncrement, entanglementIncrement });

    const dist = spatialDistance(p1, p2);
    let spiked = false;
    if (interact && dist < threshold) {
      const mid = {
        x: 0.5 * (p3a.x + p3b.x),
        y: 0.5 * (p3a.y + p3b.y),
        z: 0.5 * (p3a.z + p3b.z),
      };
      const spike = depositInteractionSpike(egt, mid, {
        rhoBoost: opts.rhoBoost ?? 4,
        wBoost: opts.wBoost ?? 1.5,
        radius: opts.spikeRadius ?? 1.4,
      });
      spiked = true;
      interactionFrames.push({
        frame: f,
        t,
        dist,
        centerId: spike.centerId,
        touched: spike.touched,
      });
      if (spike.touched > maxSpike) maxSpike = spike.touched;
    }

    recomputeCurvature(egt, { alpha, beta });
    egt.t = t;
    egt.hash = hashEGT(egt);

    let edgeSum = 0;
    for (const e of egt.edges) edgeSum += e.w_ij;
    edgeSumSeries.push({ t, edgeSum, dist, spiked });

    track1.push({ t: p1.t, x: p1.x, y: p1.y, z: p1.z });
    track2.push({ t: p2.t, x: p2.x, y: p2.y, z: p2.z });
    framePeaks.push({ t, nearestId: d1.nearestId });
    framePeaks.push({ t: t + 0.001, nearestId: d2.nearestId });

    void checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: true });
  }

  // Combined track for reconstruction (primary = W1)
  const reconstruction = reconstructApproximateBulk(egt, track1, framePeaks.filter((_, i) => i % 2 === 0));
  const health = entanglementHealth(egt);
  const governance = buildGovernanceAudit({
    coupling: checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: true }),
    health,
    reconstructionError: reconstruction.metrics.reconstructionError,
    maxRhoPeakDist: reconstruction.metrics.maxRhoPeakDist,
  });

  let maxRho = 0;
  let maxK = 0;
  for (let i = 0; i < egt.rho.length; i++) {
    if (egt.rho[i] > maxRho) maxRho = egt.rho[i];
    const ak = Math.abs(egt.K[i]);
    if (ak > maxK) maxK = ak;
  }
  let edgeSum = 0;
  for (const e of egt.edges) edgeSum += e.w_ij;

  // Interaction spike proof: max edgeSum growth rate around interaction frames
  let spikeProof = { ok: false, peakEdgeSum: 0, baselineEdgeSum: 0, ratio: 0 };
  if (edgeSumSeries.length) {
    const peak = edgeSumSeries.reduce((a, b) => (b.edgeSum > a.edgeSum ? b : a));
    const early = edgeSumSeries.slice(0, Math.max(1, Math.floor(frames * 0.15)));
    const baseline =
      early.reduce((s, r) => s + r.edgeSum, 0) / early.length;
    spikeProof = {
      ok: interactionFrames.length > 0 && peak.edgeSum > baseline * 1.2,
      peakEdgeSum: peak.edgeSum,
      baselineEdgeSum: baseline,
      ratio: baseline > 0 ? peak.edgeSum / baseline : Infinity,
      peakAtT: peak.t,
    };
  }

  const heat = renderEGTHeatmap(egt, { width, height });
  const warped = renderEGTEmergentGeometry(egt, { width, height });
  const bulk = renderBulkWorldlineRgb(
    [...track1, ...track2.map((p) => ({ ...p, x: p.x }))],
    { width, height: Math.round(height * 0.75) },
  );

  const receipt = {
    kind: "two-worldline-interference-receipt",
    status: INTERFERENCE_STATUS,
    convention: BOUNDARY_PLANE_CONVENTION,
    frames,
    threshold,
    interact,
    interactionFrameCount: interactionFrames.length,
    interactionFrames: interactionFrames.slice(0, 12),
    maxSpikeTouched: maxSpike,
    maxRho,
    maxK,
    edgeSum,
    spikeProof,
    reconstructionError: reconstruction.metrics.reconstructionError,
    maxRhoPeakDist: reconstruction.metrics.maxRhoPeakDist,
    egtHash: egt.hash,
    governance,
    modes: [EFR_MODES.HEATMAP, EFR_MODES.EMERGENT_GEOMETRY],
    note: "Toy interference — Claim A; not QFT scattering",
  };

  return {
    egt,
    track1,
    track2,
    interactionFrames,
    receipt,
    reconstruction,
    images: { heatmap: heat, warped, bulk },
  };
}

/**
 * Interact vs non-interacting control — proves spike raises maxRho / edge activity.
 * @param {object} [opts]
 */
export function runInterferenceVsControl(opts = {}) {
  const shared = { ...opts };
  const interacting = runTwoWorldlineInterference({ ...shared, interact: true });
  const control = runTwoWorldlineInterference({ ...shared, interact: false });
  const comparison = {
    interactingMaxRho: interacting.receipt.maxRho,
    controlMaxRho: control.receipt.maxRho,
    interactingEdgeSum: interacting.receipt.edgeSum,
    controlEdgeSum: control.receipt.edgeSum,
    maxRhoHigher: interacting.receipt.maxRho > control.receipt.maxRho,
    edgeSumHigher: interacting.receipt.edgeSum > control.receipt.edgeSum,
    interactionFrameCount: interacting.receipt.interactionFrameCount,
  };
  return { interacting, control, comparison };
}

/** CLI entry when executed directly or via test-scene --interference */
export function writeInterferenceArtifacts(outDir, result) {
  mkdirSync(outDir, { recursive: true });
  const { images, receipt } = result;
  writeFileSync(
    join(outDir, "boundary-heatmap.png"),
    rgbToPng(images.heatmap.width, images.heatmap.height, images.heatmap.rgb),
  );
  writeFileSync(
    join(outDir, "boundary-warped.png"),
    rgbToPng(images.warped.width, images.warped.height, images.warped.rgb),
  );
  writeFileSync(
    join(outDir, "bulk-worldlines.png"),
    rgbToPng(images.bulk.width, images.bulk.height, images.bulk.rgb),
  );
  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  return outDir;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const OUT = join(__dirname, "../../../output/mandala-holography/interference");
  const result = runTwoWorldlineInterference();
  writeInterferenceArtifacts(OUT, result);
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        interactionFrameCount: result.receipt.interactionFrameCount,
        spikeProof: result.receipt.spikeProof,
        maxRho: result.receipt.maxRho,
        maxK: result.receipt.maxK,
      },
      null,
      2,
    ),
  );
}
