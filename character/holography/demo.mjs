#!/usr/bin/env node
/**
 * Character holography demo — muscle / face / full-body.
 *
 *   node character/holography/demo.mjs
 *
 * Artifacts → output/character-holography/
 * Status: **partial** — synthetic informational character layer.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../../mandala/engine/png.mjs";
import { buildCharacterAsset } from "../models/character.mjs";
import {
  buildSkinEGT,
  fireNamedMuscle,
  assertMuscleFire,
  buildFacePatch,
  buildFaceEGT,
  applySmile,
  assertSmileDiffers,
  expressionFingerprint,
  buildBodyEGT,
  inferBulkToy,
  evolveBreathing,
  assertBreathingChanges,
  renderSkinRhoHeatmap,
  renderSkinWarpedPreview,
  renderSkinCombined,
  renderActivationCompare,
  SKIN_EGT_STATUS,
  MUSCLE_STATUS,
  BIOMECHANICS_STATUS,
  FACE_EGT_STATUS,
  FACE_RETOPO_STATUS,
  FULL_BODY_STATUS,
  GOVERNED_BODY_STATUS,
  REALISTIC_DEFAULT_STATUS,
  BULK_TOY_STATUS,
  ANATOMY_RT4D_STATUS,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../output/character-holography");

function main() {
  mkdirSync(OUT, { recursive: true });
  const asset = buildCharacterAsset({ id: "char-holo" });
  const skinEgt = buildSkinEGT(asset, { t: 0 });

  // --- Muscle: torso band (fallback biceps if arm verts exist) ---
  let muscleFired = fireNamedMuscle(skinEgt, "torso", 1, {
    entanglementScale: 0.5,
    contractionScale: 0.05,
    bulgeScale: 0.035,
  });
  let muscleProof = assertMuscleFire(muscleFired);
  if (!muscleProof.ok) {
    muscleFired = fireNamedMuscle(skinEgt, "biceps", 1);
    muscleProof = assertMuscleFire(muscleFired);
  }

  const muscleRestHeat = renderSkinRhoHeatmap(skinEgt, { width: 320, height: 480 });
  const muscleFiredHeat = renderSkinRhoHeatmap(muscleFired.egt, { width: 320, height: 480 });
  const muscleFiredWarp = renderSkinWarpedPreview(muscleFired.egt, { width: 320, height: 480 });
  writeFileSync(join(OUT, "muscle-rest.png"), rgbToPng(muscleRestHeat.width, muscleRestHeat.height, muscleRestHeat.rgb));
  writeFileSync(join(OUT, "muscle-fired.png"), rgbToPng(muscleFiredHeat.width, muscleFiredHeat.height, muscleFiredHeat.rgb));
  writeFileSync(join(OUT, "muscle-fired-warp.png"), rgbToPng(muscleFiredWarp.width, muscleFiredWarp.height, muscleFiredWarp.rgb));

  // --- Face patch ---
  const patch = buildFacePatch();
  const faceNeutral = buildFaceEGT(patch);
  const smile = applySmile(faceNeutral, { amount: 1 });
  const faceProof = assertSmileDiffers(faceNeutral, smile);
  const faceN = renderSkinRhoHeatmap(faceNeutral, { width: 256, height: 256 });
  const faceS = renderSkinRhoHeatmap(smile.egt, { width: 256, height: 256 });
  writeFileSync(join(OUT, "face-neutral.png"), rgbToPng(faceN.width, faceN.height, faceN.rgb));
  writeFileSync(join(OUT, "face-smile.png"), rgbToPng(faceS.width, faceS.height, faceS.rgb));

  // --- Full body + breathing ---
  const body = buildBodyEGT(asset);
  const bulk = inferBulkToy(body);
  const breath = evolveBreathing(body, 6);
  const breathProof = assertBreathingChanges(breath);
  const restF = breath.frames[0];
  const inhaleF = breath.frames[Math.floor(breath.frames.length / 4)] || breath.frames[1];
  const bodyRest = renderSkinRhoHeatmap(restF, { width: 320, height: 480 });
  const bodyBreathe = renderSkinRhoHeatmap(inhaleF, { width: 320, height: 480 });
  const bodyCombined = renderSkinCombined(inhaleF, { width: 512, height: 384 });
  writeFileSync(join(OUT, "body-rest.png"), rgbToPng(bodyRest.width, bodyRest.height, bodyRest.rgb));
  writeFileSync(join(OUT, "body-breathe.png"), rgbToPng(bodyBreathe.width, bodyBreathe.height, bodyBreathe.rgb));
  writeFileSync(join(OUT, "body-combined.png"), rgbToPng(bodyCombined.width, bodyCombined.height, bodyCombined.rgb));

  const compare = renderActivationCompare(skinEgt, muscleFired.egt);
  writeFileSync(join(OUT, "activation-compare.png"), rgbToPng(compare.width, compare.height, compare.rgb));

  const receipt = {
    kind: "character-holography-demo",
    status: SKIN_EGT_STATUS,
    claim: "Synthetic holographic character layer (partial) — not living organism / not realistic-by-default",
    characterId: asset.id,
    mesh: {
      vertices: asset.mesh.positions.length,
      quads: asset.mesh.quads.length,
      bones: asset.armature.bones.length,
    },
    muscle: {
      status: MUSCLE_STATUS,
      biomechanics: BIOMECHANICS_STATUS,
      name: muscleFired.muscle.name,
      vertexCount: muscleFired.muscle.vertexIds.length,
      anchors: muscleFired.muscle.anchorVertexIds.length,
      fiberDir: muscleFired.muscle.fiberDir,
      proof: muscleProof,
      metrics: muscleFired.metrics,
      fingerprint: muscleFired.fingerprint,
    },
    face: {
      status: FACE_EGT_STATUS,
      faceRetopo: FACE_RETOPO_STATUS,
      proof: faceProof,
      fpNeutral: expressionFingerprint(faceNeutral),
      fpSmile: smile.fingerprint,
      controls: smile.controls,
    },
    body: {
      status: FULL_BODY_STATUS,
      governedBody: GOVERNED_BODY_STATUS,
      realisticDefault: REALISTIC_DEFAULT_STATUS,
      bulkStatus: BULK_TOY_STATUS,
      anatomyRt4d: ANATOMY_RT4D_STATUS,
      bonePaths: bulk.bonePaths.length,
      breathProof,
      torsoRho: breath.torsoRho,
    },
    artifacts: [
      "muscle-rest.png",
      "muscle-fired.png",
      "muscle-fired-warp.png",
      "face-neutral.png",
      "face-smile.png",
      "body-rest.png",
      "body-breathe.png",
      "body-combined.png",
      "activation-compare.png",
      "receipt.json",
      "bulk-toy.json",
    ],
    holographyReuse: {
      curvature: "mandala/holography/egt.mjs#recomputeCurvature",
      efr: "mandala/holography/efr.mjs",
    },
    tags: {
      skinEgt: SKIN_EGT_STATUS,
      muscle: MUSCLE_STATUS,
      biomechanics: BIOMECHANICS_STATUS,
      face: FACE_EGT_STATUS,
      faceRetopo: FACE_RETOPO_STATUS,
      fullBody: FULL_BODY_STATUS,
      governedBody: GOVERNED_BODY_STATUS,
      realisticDefault: REALISTIC_DEFAULT_STATUS,
      bulkToy: BULK_TOY_STATUS,
      anatomyRt4d: ANATOMY_RT4D_STATUS,
      shaderHolo: "partial",
    },
  };

  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(
    join(OUT, "bulk-toy.json"),
    JSON.stringify(
      {
        bonePaths: bulk.bonePaths.slice(0, 24),
        highRho: bulk.highRhoMuscles.slice(0, 24),
        softCount: bulk.softTissue.count,
        status: FULL_BODY_STATUS,
      },
      null,
      2,
    ),
  );

  const ok = muscleProof.ok && faceProof.ok && breathProof.ok;
  console.log(
    JSON.stringify(
      {
        ok,
        out: OUT,
        muscle: muscleProof,
        face: { ok: faceProof.ok, checks: faceProof.checks },
        breath: breathProof,
        metrics: {
          muscleMaxDisp: muscleFired.metrics.maxDisplacement,
          muscleMeanBelly: muscleFired.metrics.meanBellyDisplacement,
          muscleMeanAnchor: muscleFired.metrics.meanAnchorDisplacement,
          torsoRho: breath.torsoRho,
        },
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
}

main();
