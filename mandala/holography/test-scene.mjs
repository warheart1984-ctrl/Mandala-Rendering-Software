#!/usr/bin/env node
/**
 * Tiny holographic test scene — end-to-end demo (Claim A).
 *
 * Usage:
 *   node mandala/holography/test-scene.mjs
 *   node mandala/holography/test-scene.mjs --interference
 *
 * Tiny: output/mandala-holography/tiny-scene/
 * Interference: output/mandala-holography/interference/
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../engine/png.mjs";
import { runTinyHolographicScene } from "./tiny-scene.mjs";
import {
  runInterferenceVsControl,
  writeInterferenceArtifacts,
} from "./scenes/two-worldline-interference.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wantInterference = process.argv.includes("--interference");

function copyConsole(outDir) {
  const candidates = [
    join(__dirname, "console/sovereign-holography.html"),
    join(__dirname, "console/holography-console.html"),
  ];
  for (const src of candidates) {
    if (existsSync(src)) {
      copyFileSync(src, join(outDir, "sovereign-holography.html"));
      break;
    }
  }
}

function runTiny() {
  const OUT = join(__dirname, "../../output/mandala-holography/tiny-scene");
  mkdirSync(OUT, { recursive: true });

  const result = runTinyHolographicScene({
    frames: 48,
    dt: 1,
    v_x: 0.15,
    sizeX: 10,
    sizeY: 10,
    resolutionX: 32,
    resolutionY: 32,
    z: 0,
    densityIncrement: 1,
    entanglementIncrement: 0.35,
    width: 384,
    height: 256,
  });

  const { images, receipt } = result;

  writeFileSync(
    join(OUT, "bulk-worldline.png"),
    rgbToPng(images.bulk.width, images.bulk.height, images.bulk.rgb),
  );
  writeFileSync(
    join(OUT, "boundary-heatmap.png"),
    rgbToPng(images.heatmap.width, images.heatmap.height, images.heatmap.rgb),
  );
  writeFileSync(
    join(OUT, "boundary-warped.png"),
    rgbToPng(images.warped.width, images.warped.height, images.warped.rgb),
  );
  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));
  copyConsole(OUT);

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        artifacts: [
          "bulk-worldline.png",
          "boundary-heatmap.png",
          "boundary-warped.png",
          "receipt.json",
          "sovereign-holography.html",
        ],
        maxRho: receipt.maxRho,
        maxK: receipt.maxK,
        edgeSum: receipt.edgeSum,
        reconstructionError: receipt.reconstructionError,
        maxWorldlineError: receipt.maxWorldlineError,
        maxRhoPeakDist: receipt.maxRhoPeakDist,
        governanceOk: receipt.governance?.ok,
        nodeCount: receipt.nodeCount,
        frames: receipt.frames,
        convention: receipt.convention,
      },
      null,
      2,
    ),
  );
}

function runInterference() {
  const OUT = join(__dirname, "../../output/mandala-holography/interference");
  const { interacting, control, comparison } = runInterferenceVsControl({
    frames: 60,
    resolutionX: 32,
    resolutionY: 32,
  });
  writeInterferenceArtifacts(OUT, interacting);
  writeFileSync(join(OUT, "control-receipt.json"), JSON.stringify(control.receipt, null, 2));
  writeFileSync(join(OUT, "comparison.json"), JSON.stringify(comparison, null, 2));
  copyConsole(OUT);

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        artifacts: [
          "boundary-heatmap.png",
          "boundary-warped.png",
          "bulk-worldlines.png",
          "receipt.json",
          "control-receipt.json",
          "comparison.json",
          "sovereign-holography.html",
        ],
        comparison,
        spikeProof: interacting.receipt.spikeProof,
      },
      null,
      2,
    ),
  );
}

function main() {
  if (wantInterference) runInterference();
  else runTiny();
}

main();
