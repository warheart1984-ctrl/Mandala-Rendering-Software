#!/usr/bin/env node
/**
 * Holography demo — bulk / boundary / EGT+EFR dual view (Claim A).
 *
 * Usage:
 *   node mandala/holography/demo.mjs
 *   node mandala/holography/demo.mjs --egt
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialCertifiedState } from "../proto/certified-state.mjs";
import { rgbToPng } from "../engine/png.mjs";
import {
  projectCertifiedHolography,
  computeBoundaryScreen,
  boundaryToEntanglementBitmap,
  midSliceZ,
  scalarPlaneToRgb,
  encodeBoundary,
  reconstructBulkPreview,
  MINKOWSKI_ETA,
  inducedMetric3,
  createBulkSpacetimeEngine,
  createHolographicEncoder,
  createEntanglementRenderer,
  EFR_MODES,
  assertNormalUnit,
  staticObserverNormal,
  projectNaive,
  projectWithNormal,
  g_munu,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../output/mandala-holography");
const wantEgt = process.argv.includes("--egt");

function main() {
  mkdirSync(OUT, { recursive: true });
  const state = createInitialCertifiedState({ seed: 7 });
  const hashBefore = state.hash;

  const { preview, boundary, boundaryInfo, receipt, certifiedLiveHash } =
    projectCertifiedHolography(state);

  if (state.hash !== hashBefore) {
    throw new Error("demo mutated certified hash");
  }

  const ent = boundaryToEntanglementBitmap(boundary);
  writeFileSync(
    join(OUT, "boundary-entanglement.png"),
    rgbToPng(ent.width, ent.height, ent.rgb),
  );

  const screenResult = computeBoundaryScreen(state, state.t);
  writeFileSync(
    join(OUT, "holographic-screen.png"),
    rgbToPng(
      screenResult.screen.width,
      screenResult.screen.height,
      screenResult.screen.rgb,
    ),
  );

  const midBulk = midSliceZ(state.scalar, state.shape);
  const midPrev = midSliceZ(preview, state.shape);
  const rgbBulk = scalarPlaneToRgb(midBulk.plane, midBulk.width, midBulk.height);
  const rgbPrev = scalarPlaneToRgb(midPrev.plane, midPrev.width, midPrev.height);
  writeFileSync(
    join(OUT, "bulk-mid-slice.png"),
    rgbToPng(midBulk.width, midBulk.height, rgbBulk.rgb),
  );
  writeFileSync(
    join(OUT, "reconstructed-mid-slice.png"),
    rgbToPng(midPrev.width, midPrev.height, rgbPrev.rgb),
  );

  const b2 = encodeBoundary(state.scalar, state.shape);
  const facesHash = boundaryInfo?.facesOnlyHash || boundary.hash;
  if (b2.hash !== facesHash) {
    throw new Error("encode not deterministic vs project faces");
  }

  const artifacts = [
    "boundary-entanglement.png",
    "holographic-screen.png",
    "bulk-mid-slice.png",
    "reconstructed-mid-slice.png",
  ];

  let egtReceipt = null;
  if (wantEgt) {
    // Frame loop sketch: bulk.step → encoder.updateEGT → render modes
    const bulk = createBulkSpacetimeEngine({ state });
    const encoder = createHolographicEncoder({ stride: 2 });
    const renderer = createEntanglementRenderer({ width: 384, height: 192 });

    let egt = encoder.buildEGT(bulk.state);
    // Optional one chamber step then update (observation copy path for EGT)
    const liveHash = bulk.state.hash;
    egt = encoder.updateEGT(egt, bulk.state);
    if (bulk.state.hash !== liveHash) {
      throw new Error("EGT path mutated certified hash");
    }

    const heat = renderer.render(egt, EFR_MODES.HEATMAP);
    const causal = renderer.render(egt, EFR_MODES.CAUSAL);
    const emergent = renderer.render(egt, EFR_MODES.EMERGENT_GEOMETRY);
    const combined = renderer.render(egt, EFR_MODES.COMBINED);

    writeFileSync(join(OUT, "egt-heatmap.png"), rgbToPng(heat.width, heat.height, heat.rgb));
    writeFileSync(join(OUT, "egt-causal.png"), rgbToPng(causal.width, causal.height, causal.rgb));
    writeFileSync(
      join(OUT, "egt-emergent.png"),
      rgbToPng(emergent.width, emergent.height, emergent.rgb),
    );
    writeFileSync(
      join(OUT, "egt-combined.png"),
      rgbToPng(combined.width, combined.height, combined.rgb),
    );

    // Dual overlay: bulk mid-slice next to boundary heatmap strip (cheap combined)
    const dualW = midBulk.width + heat.width;
    const dualH = Math.max(midBulk.height, heat.height);
    const dual = new Uint8Array(dualW * dualH * 3);
    for (let y = 0; y < midBulk.height; y++) {
      for (let x = 0; x < midBulk.width; x++) {
        const s = (x + midBulk.width * y) * 3;
        const d = (x + dualW * y) * 3;
        dual[d] = rgbBulk.rgb[s];
        dual[d + 1] = rgbBulk.rgb[s + 1];
        dual[d + 2] = rgbBulk.rgb[s + 2];
      }
    }
    for (let y = 0; y < heat.height; y++) {
      for (let x = 0; x < heat.width; x++) {
        const s = (x + heat.width * y) * 3;
        const d = (midBulk.width + x + dualW * y) * 3;
        dual[d] = heat.rgb[s];
        dual[d + 1] = heat.rgb[s + 1];
        dual[d + 2] = heat.rgb[s + 2];
      }
    }
    writeFileSync(join(OUT, "dual-bulk-boundary.png"), rgbToPng(dualW, dualH, dual));

    artifacts.push(
      "egt-heatmap.png",
      "egt-causal.png",
      "egt-emergent.png",
      "egt-combined.png",
      "dual-bulk-boundary.png",
    );

    egtReceipt = {
      nodes: egt.nodes.length,
      edges: egt.edges.length,
      causalLinks: (egt.C || egt.causalLinks).length,
      alpha: egt.alpha,
      beta: egt.beta,
      hash: egt.hash,
      projectorId: egt.projectorId,
      status: "partial",
      reconstruction: "partial/toy",
    };

    // Projector sanity in demo
    assertNormalUnit(staticObserverNormal(), g_munu);
    const v = [2, 3, 4, 5];
    const pn = projectNaive(v);
    const pw = projectWithNormal(v);
    if (pn.x !== pw.x || pn.y !== pw.y || pn.z !== pw.z) {
      throw new Error("static observer P ≢ naive spatially");
    }
  }

  const hInduced = inducedMetric3(MINKOWSKI_ETA);
  const summary = {
    status: "partial",
    claim: "A",
    claimB: false,
    syntheticDual: "partial",
    certifiedHash: certifiedLiveHash,
    inducedMetricId: receipt.inducedMetricId,
    inducedMetricIsDelta: hInduced.id,
    receipt,
    screenReceipt: screenResult.receipt,
    egt: egtReceipt,
    artifacts,
    outDir: OUT,
    note:
      "Partial/toy reconstruct ≠ certified bulk. Time = {EGT_t} relationships. Not AdS/CFT.",
  };
  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
