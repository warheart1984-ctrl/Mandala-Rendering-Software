#!/usr/bin/env node
/**
 * Rig entanglement tensor + CIEMS governance demo (partial).
 *
 *   node character/holography/rig-ciems-demo.mjs
 *
 * Artifacts → output/character-holography/rig-tensor/
 * Does not touch scripts/full-stack-showcase.mjs.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../../mandala/engine/png.mjs";
import { buildCharacterAsset } from "../models/character.mjs";
import {
  buildSkinEGT,
  buildMuscleRegionFromEgt,
  fireMuscle,
  enrichWithRigCiems,
  activateMuscleFromCurvature,
  assertActivationRisesWithK,
  mat3IsPsdIsh,
  mat3SymmetryResidual,
  renderFieldHeatmap,
  renderSkinRhoHeatmap,
  RIG_NODE_STATUS,
  RIG_CIEMS_STATUS,
  CURVATURE_ACTIVATION_STATUS,
  MUSCLE_STATUS,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../output/character-holography/rig-tensor");

function main() {
  mkdirSync(OUT, { recursive: true });
  const asset = buildCharacterAsset({ id: "char-rig-ciems" });
  const skin = buildSkinEGT(asset, { t: 0 });

  const { egt, receipt } = enrichWithRigCiems(skin);

  // Sanity: E tensors PSD-ish + symmetric
  let psdOk = 0;
  let symMax = 0;
  for (const rn of egt.rigNodes) {
    if (mat3IsPsdIsh(rn.E)) psdOk++;
    symMax = Math.max(symMax, mat3SymmetryResidual(rn.E));
  }

  const muscle = buildMuscleRegionFromEgt(egt, {
    id: 1,
    name: "torso_band",
    region: "torso",
    yMin: 1.32,
    yMax: 1.58,
    maxSeeds: 24,
  });

  const rise = assertActivationRisesWithK(egt, muscle);
  const curvAct = activateMuscleFromCurvature(egt, muscle, {
    t: 1,
    entanglementScale: 0.5,
  });

  // Classic fire path (e2e-safe default) + optional curvature path
  const firedClassic = fireMuscle(egt, muscle, 1, {
    contractionScale: 0.05,
    bulgeScale: 0.03,
  });
  const firedCurv = fireMuscle(egt, muscle, 1, {
    useCurvatureActivation: true,
    contractionScale: 0.05,
    bulgeScale: 0.03,
  });

  // Re-attach gov after deformation on curvature-fired egt
  const { receipt: firedReceipt } = enrichWithRigCiems(firedCurv.egt);

  const heatE = renderFieldHeatmap(egt, "E", { width: 320, height: 480 });
  const heatK = renderFieldHeatmap(egt, "K", { width: 320, height: 480 });
  const heatRho = renderSkinRhoHeatmap(curvAct.egt, { width: 320, height: 480 });

  writeFileSync(join(OUT, "E-norm-heatmap.png"), rgbToPng(heatE.width, heatE.height, heatE.rgb));
  writeFileSync(join(OUT, "K-heatmap.png"), rgbToPng(heatK.width, heatK.height, heatK.rgb));
  writeFileSync(join(OUT, "rho-curvature-act.png"), rgbToPng(heatRho.width, heatRho.height, heatRho.rgb));

  const demoReceipt = {
    kind: "character-holography-rig-tensor-demo",
    status: RIG_CIEMS_STATUS,
    claim:
      "Rig entanglement tensors + curvature→activation + CIEMS gov coords (partial). Not enforced constitutional holographic organism arena.",
    tags: {
      rigNode: RIG_NODE_STATUS,
      curvatureActivation: CURVATURE_ACTIVATION_STATUS,
      rigCiems: RIG_CIEMS_STATUS,
      muscle: MUSCLE_STATUS,
      organismArena: "declared",
    },
    formulas: {
      E_i: "Σ_j w_ij · d̂^{ij} ⊗ d̂^{ij}",
      epsilon_i: "Σ_j w_ij",
      K_i: "α‖∇ε‖ + βΔε",
      A_k: "sigmoid(mean |K| over M_k)",
      rho_i: "g(K_i, A_k, fiberAlign)",
      GovernanceCoord: "{ intent, evidence, conformance, stewardship } ∈ [0,1]",
    },
    entanglement: {
      nodeCount: egt.rigNodes.length,
      psdIshFraction: psdOk / egt.rigNodes.length,
      maxSymmetryResidual: symMax,
      meanE_norm: receipt.entanglement.meanE_norm,
      maxE_norm: receipt.entanglement.maxE_norm,
    },
    curvatureActivation: {
      riseProof: rise,
      regionActivation: curvAct.regionActivation,
      meanK: curvAct.meanK,
      meanBellyRho: curvAct.meanBellyRho,
    },
    muscleFire: {
      classicMaxDisp: firedClassic.metrics.maxDisplacement,
      curvatureMaxDisp: firedCurv.metrics.maxDisplacement,
      curvatureMetrics: firedCurv.metrics.curvatureActivation || null,
    },
    governance: receipt.frameGovernance,
    governanceAfterFire: firedReceipt.frameGovernance,
    fingerprints: {
      rest: receipt.fingerprint,
      fired: firedReceipt.fingerprint,
    },
    artifacts: [
      "E-norm-heatmap.png",
      "K-heatmap.png",
      "rho-curvature-act.png",
      "receipt.json",
    ],
    docs: [
      "docs/mandala/CHARACTER_HOLOGRAPHY.md",
      "docs/mandala/HOLOGRAPHIC_CIEMS.md",
    ],
  };

  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(demoReceipt, null, 2));

  const ok =
    rise.ok &&
    psdOk === egt.rigNodes.length &&
    symMax < 1e-12 &&
    receipt.frameGovernance.means.count > 0;

  console.log(
    JSON.stringify(
      {
        ok,
        out: OUT,
        psdIshFraction: demoReceipt.entanglement.psdIshFraction,
        rise,
        frameGov: receipt.frameGovernance.means,
        meanE: receipt.entanglement.meanE_norm,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
}

main();
