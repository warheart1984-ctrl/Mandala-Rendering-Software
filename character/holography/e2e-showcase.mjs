#!/usr/bin/env node
/**
 * Character holography E2E showcase — visible PNG (+ optional MP4).
 *
 *   node character/holography/e2e-showcase.mjs
 *
 * Artifacts → output/character-holography/e2e-showcase/
 *   frame-final.png  (must exist)
 *   showcase.mp4     (if ≥2 frames + ffmpeg)
 *   receipt.json
 *
 * Status: **partial** — CPU EFR dual views; not production biomechanics /
 * “realistic by default”. Chamber RT4D + SD painter skipped by default
 * (slow / OOM risk on this box).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
  CHAR_EFR_STATUS,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../..");
const OUT = join(REPO, "output/character-holography/e2e-showcase");
const FFMPEG = join(REPO, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");

const W = 160;
const H = 240;

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function writePng(name, frame) {
  const path = join(OUT, name);
  const png = rgbToPng(frame.width, frame.height, frame.rgb);
  writeFileSync(path, png);
  return {
    path,
    bytes: png.length,
    sha256: sha256Hex(png),
    width: frame.width,
    height: frame.height,
  };
}

/** Place `src` RGB into `dst` at (ox, oy). */
function blit(dst, dw, dh, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dw) continue;
      const si = (y * sw + x) * 3;
      const di = (dy * dw + dx) * 3;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
    }
  }
}

/** 2×2 collage of four equal frames. */
function collage2x2(frames) {
  const cw = frames[0].width;
  const ch = frames[0].height;
  const width = cw * 2;
  const height = ch * 2;
  const rgb = new Uint8Array(width * height * 3);
  const positions = [
    [0, 0],
    [cw, 0],
    [0, ch],
    [cw, ch],
  ];
  for (let i = 0; i < 4; i++) {
    const f = frames[Math.min(i, frames.length - 1)];
    blit(rgb, width, height, f.rgb, f.width, f.height, positions[i][0], positions[i][1]);
  }
  return { width, height, rgb };
}

function encodeMp4(framePaths) {
  if (framePaths.length < 2) {
    return { ok: false, skipped: true, reason: "need ≥2 frames" };
  }
  if (!existsSync(FFMPEG)) {
    return { ok: false, skipped: true, reason: `ffmpeg missing at ${FFMPEG}` };
  }
  const listPath = join(OUT, "concat.txt");
  const lines = [];
  for (const p of framePaths) {
    lines.push(`file '${p.replace(/'/g, "'\\''")}'`);
    lines.push("duration 0.75");
  }
  lines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
  writeFileSync(listPath, lines.join("\n") + "\n");
  const mp4 = join(OUT, "showcase.mp4");
  const r = spawnSync(
    FFMPEG,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !existsSync(mp4)) {
    return {
      ok: false,
      skipped: false,
      reason: String(r.stderr || r.stdout || "ffmpeg failed").slice(-800),
      status: r.status,
    };
  }
  return { ok: true, path: mp4, bytes: statSync(mp4).size };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const organs = {
    characterHolography: { ran: false, status: "partial" },
    muscleFire: { ran: false, status: MUSCLE_STATUS },
    faceSmile: { ran: false, status: FACE_EGT_STATUS },
    bodyBreath: { ran: false, status: FULL_BODY_STATUS },
    cpuEfr: { ran: false, status: CHAR_EFR_STATUS },
    mandalaProto: {
      ran: false,
      skipped: true,
      reason: "not required for picture; keep showcase fast",
    },
    simulationChamber: {
      ran: false,
      skipped: true,
      reason: "RT4D too slow on FX-8350 / RX 580 for this smoke",
    },
    goldenPainter: {
      ran: false,
      skipped: true,
      reason: "SD 512 OOM risk; skipped (no painter overlay)",
    },
    ffmpeg: { ran: false },
  };

  const asset = buildCharacterAsset({ id: "e2e-showcase" });
  const skinEgt = buildSkinEGT(asset, { t: 0 });
  organs.characterHolography.ran = true;
  organs.characterHolography.nodes = skinEgt.nodes.length;
  organs.characterHolography.edges = skinEgt.edges.length;
  organs.characterHolography.hash = skinEgt.hash;

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
  organs.muscleFire.ran = true;
  organs.muscleFire.proof = muscleProof;
  organs.muscleFire.fingerprint = muscleFired.fingerprint;
  organs.muscleFire.metrics = muscleFired.metrics;
  organs.muscleFire.biomechanics = BIOMECHANICS_STATUS;

  const patch = buildFacePatch();
  const faceNeutral = buildFaceEGT(patch);
  const smile = applySmile(faceNeutral, { amount: 1 });
  const faceProof = assertSmileDiffers(faceNeutral, smile);
  organs.faceSmile.ran = true;
  organs.faceSmile.proof = faceProof;
  organs.faceSmile.fpNeutral = expressionFingerprint(faceNeutral);
  organs.faceSmile.fpSmile = smile.fingerprint;
  organs.faceSmile.faceRetopo = FACE_RETOPO_STATUS;

  const body = buildBodyEGT(asset);
  const bulk = inferBulkToy(body);
  const breath = evolveBreathing(body, 4);
  const breathProof = assertBreathingChanges(breath);
  organs.bodyBreath.ran = true;
  organs.bodyBreath.proof = breathProof;
  organs.bodyBreath.torsoRho = breath.torsoRho;
  organs.bodyBreath.fingerprints = breath.fingerprints;
  organs.bodyBreath.bulkToy = BULK_TOY_STATUS;
  organs.bodyBreath.anatomyRt4d = ANATOMY_RT4D_STATUS;
  organs.bodyBreath.governedBody = GOVERNED_BODY_STATUS;
  organs.bodyBreath.realisticDefault = REALISTIC_DEFAULT_STATUS;

  organs.cpuEfr.ran = true;
  const restHeat = renderSkinRhoHeatmap(skinEgt, { width: W, height: H });
  const fireHeat = renderSkinRhoHeatmap(muscleFired.egt, { width: W, height: H });
  const fireWarp = renderSkinWarpedPreview(muscleFired.egt, { width: W, height: H });
  const faceS = renderSkinRhoHeatmap(smile.egt, { width: W, height: H });
  const inhale = breath.frames[Math.floor(breath.frames.length / 2)] || breath.frames[1];
  const breathHeat = renderSkinRhoHeatmap(inhale, { width: W, height: H });
  const bodyCombined = renderSkinCombined(inhale, { width: W * 2, height: H });

  const artifacts = {};
  artifacts["01-rest.png"] = writePng("01-rest.png", restHeat);
  artifacts["02-muscle-fire.png"] = writePng("02-muscle-fire.png", fireHeat);
  artifacts["03-muscle-warp.png"] = writePng("03-muscle-warp.png", fireWarp);
  artifacts["04-face-smile.png"] = writePng("04-face-smile.png", faceS);
  artifacts["05-breath.png"] = writePng("05-breath.png", breathHeat);
  artifacts["06-combined.png"] = writePng("06-combined.png", bodyCombined);

  const collage = collage2x2([restHeat, fireHeat, faceS, breathHeat]);
  artifacts["frame-final.png"] = writePng("frame-final.png", collage);

  const sequencePaths = [
    artifacts["01-rest.png"].path,
    artifacts["02-muscle-fire.png"].path,
    artifacts["04-face-smile.png"].path,
    artifacts["05-breath.png"].path,
    artifacts["06-combined.png"].path,
  ];
  const mp4 = encodeMp4(sequencePaths);
  organs.ffmpeg = mp4.ok
    ? { ran: true, path: mp4.path, bytes: mp4.bytes }
    : { ran: false, skipped: !!mp4.skipped, reason: mp4.reason, status: mp4.status };
  if (mp4.ok) {
    artifacts["showcase.mp4"] = { path: mp4.path, bytes: mp4.bytes };
  }

  const finalPath = join(OUT, "frame-final.png");
  if (!existsSync(finalPath) || statSync(finalPath).size < 64) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "frame-final.png missing or empty — showcase failed",
          out: OUT,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const asserts = {
    muscleNonzeroDisplacement: !!(muscleProof.ok && muscleFired.metrics?.maxDisplacement > 0),
    smileDiffersNeutral: !!faceProof.ok,
    breathChangesTorsoRho: !!breathProof.ok,
    frameFinalExists: true,
  };
  const ok =
    asserts.muscleNonzeroDisplacement &&
    asserts.smileDiffersNeutral &&
    asserts.breathChangesTorsoRho &&
    asserts.frameFinalExists;

  const receipt = {
    kind: "character-holography-e2e-showcase",
    status: "partial",
    note:
      "E2E smoke picture path — CPU character holography EFR. Not production biomechanics / realistic-by-default / Chamber RT4D.",
    claim:
      "Synthetic holographic character layer (partial) — e2e showcase PNG written; not living organism",
    command: "node character/holography/e2e-showcase.mjs",
    resolution: { frameW: W, frameH: H, collage: `${W * 2}x${H * 2}` },
    asserts,
    ok,
    organs,
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
      cpuEfr: CHAR_EFR_STATUS,
    },
    bulk: {
      bonePaths: bulk.bonePaths?.length ?? 0,
      highRho: bulk.highRhoMuscles?.length ?? 0,
    },
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([k, v]) => [
        k,
        {
          path: v.path,
          bytes: v.bytes,
          sha256: v.sha256,
          width: v.width,
          height: v.height,
        },
      ]),
    ),
    frameFinal: artifacts["frame-final.png"],
    showcaseMp4: mp4.ok ? { path: mp4.path, bytes: mp4.bytes } : null,
  };

  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));

  console.log(
    JSON.stringify(
      {
        ok,
        frameFinal: finalPath,
        showcaseMp4: mp4.ok ? mp4.path : null,
        asserts,
        organsRan: Object.entries(organs)
          .filter(([, v]) => v.ran)
          .map(([k]) => k),
        organsSkipped: Object.entries(organs)
          .filter(([, v]) => v.skipped)
          .map(([k, v]) => `${k}: ${v.reason}`),
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
}

main();
