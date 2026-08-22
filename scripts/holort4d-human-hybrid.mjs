#!/usr/bin/env node
/**
 * HoloRT4D + SD-Turbo hybrid — trace-owned face, SD surround (shoulders/atmosphere).
 *
 * Pipeline:
 *   holort4d-human-frame.mjs → face mask → SD img2img inpaint (outside mask) → composite
 *
 * Usage:
 *   node scripts/holort4d-human-hybrid.mjs [--width 512] [--height 512] [--skip-holort4d]
 *
 * Output: output/holort4d-human/hybrid/{composite,face-mask,sd-surround}.png + provenance.json
 * Status: partial — face from HoloRT4D field/lighting; surround from SD-Turbo when sd-server up.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { Camera4D } from "../mrs/packages/renderer-core/src/render/rt4d/camera/Camera4D.js";
import { encodePngRgba8 } from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";
import { decodePngToRgb } from "../mandala/engine/png.mjs";
import {
  DEFAULT_HUMAN_POSE,
  buildFaceProtectMaskRgba,
  buildSdInpaintMaskL,
  computeHybridProtectEllipse,
} from "./holort4d-human-face.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const HOLORT4D_DIR = join(REPO, "output/holort4d-human/holort4d");
const HYBRID_DIR = join(REPO, "output/holort4d-human/hybrid");
const SD_REFERENCE = join(REPO, "output/holort4d-human/human.png");
const SD_URL = process.env.SD_SERVER_URL || "http://127.0.0.1:13306";

const SD_PROMPT =
  "cinematic portrait, warm key light high angle, cool fill shadow side, shoulders and atmosphere, "
  + "dark neutral background, contact shadow on ground, restrained mood, head-shoulders crop";
const SD_NEGATIVE =
  "flat lighting, gray wash, oversaturated, text, watermark, logo, extra limbs, deformed face";

function parseArgs(argv) {
  const opts = {
    width: 512,
    height: 512,
    samples: 8,
    seed: 42,
    skipHolort4d: false,
    sdSteps: 4,
    sdCfg: 1.0,
    sdStrength: 0.72,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--samples" && argv[i + 1]) opts.samples = parseInt(argv[++i], 10);
    else if (a === "--seed" && argv[i + 1]) opts.seed = parseInt(argv[++i], 10);
    else if (a === "--sd-steps" && argv[i + 1]) opts.sdSteps = parseInt(argv[++i], 10);
    else if (a === "--sd-strength" && argv[i + 1]) opts.sdStrength = parseFloat(argv[++i]);
    else if (a === "--skip-holort4d") opts.skipHolort4d = true;
  }
  return opts;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runHolort4dFrame(opts) {
  const script = join(REPO, "scripts/holort4d-human-frame.mjs");
  const args = [
    script,
    "--width", String(opts.width),
    "--height", String(opts.height),
    "--samples", String(opts.samples),
    "--seed", String(opts.seed),
  ];
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`holort4d-human-frame failed: ${r.stderr || r.stdout}`);
  }
}

function loadRgb(path) {
  const { width, height, rgb } = decodePngToRgb(readFileSync(path));
  return { width, height, rgb };
}

function rgbToRgba(rgb, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, o = 0; i < rgb.length; i += 3, o += 4) {
    rgba[o] = rgb[i];
    rgba[o + 1] = rgb[i + 1];
    rgba[o + 2] = rgb[i + 2];
    rgba[o + 3] = 255;
  }
  return rgba;
}

function resizeRgbNearest(srcRgb, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 3);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const si = (sy * srcW + sx) * 3;
      const di = (y * dstW + x) * 3;
      dst[di] = srcRgb[si];
      dst[di + 1] = srcRgb[si + 1];
      dst[di + 2] = srcRgb[si + 2];
    }
  }
  return dst;
}

function maskLToPng(maskL, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < maskL.length; i++) {
    const v = maskL[i];
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return encodePngRgba8(width, height, rgba);
}

function compositeHybrid(faceRgb, sdRgb, protectRgba, width, height) {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const o = (y * width + x) * 4;
      const a = protectRgba[o + 3] / 255;
      const ia = 1 - a;
      out[i] = Math.round(faceRgb[i] * a + sdRgb[i] * ia);
      out[i + 1] = Math.round(faceRgb[i + 1] * a + sdRgb[i + 1] * ia);
      out[i + 2] = Math.round(faceRgb[i + 2] * a + sdRgb[i + 2] * ia);
    }
  }
  return out;
}

async function probeSdServer() {
  try {
    const r = await fetch(`${SD_URL}/sdapi/v1/options`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function callSdInpaint(initPng, maskPng, opts) {
  const url = `${SD_URL}/sdapi/v1/img2img`;
  const body = {
    init_images: [initPng.toString("base64")],
    mask: maskPng.toString("base64"),
    prompt: SD_PROMPT,
    negative_prompt: SD_NEGATIVE,
    width: opts.width,
    height: opts.height,
    steps: opts.sdSteps,
    cfg_scale: opts.sdCfg,
    denoising_strength: opts.sdStrength,
    seed: opts.seed,
    batch_size: 1,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`sd-server img2img ${r.status}: ${text.slice(0, 400)}`);
  }
  const payload = await r.json();
  const encoded = payload.images?.[0];
  if (!encoded) throw new Error("sd-server returned no images");
  const raw = Buffer.from(encoded, "base64");
  return decodePngToRgb(raw);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(HYBRID_DIR, { recursive: true });

  if (!opts.skipHolort4d) {
    runHolort4dFrame(opts);
  }

  const lightingPath = join(HOLORT4D_DIR, "lighting-reference.png");
  const intensityPath = join(HOLORT4D_DIR, "field-intensity.png");
  if (!existsSync(lightingPath) || !existsSync(intensityPath)) {
    throw new Error(`missing HoloRT4D outputs in ${HOLORT4D_DIR}; run without --skip-holort4d`);
  }

  const camera = new Camera4D({
    x: 0,
    y: 1.05,
    z: -2.4,
    lx: 0,
    ly: 1.0,
    lz: 0,
    width: opts.width,
    height: opts.height,
    fovX: 42,
    fovY: 52,
  });
  const faceZone = computeHybridProtectEllipse(camera, opts.width, opts.height, DEFAULT_HUMAN_POSE);
  const protectRgba = buildFaceProtectMaskRgba(opts.width, opts.height, faceZone);
  const inpaintMaskL = buildSdInpaintMaskL(opts.width, opts.height, faceZone);

  const faceMaskPath = join(HYBRID_DIR, "face-mask.png");
  writeFileSync(faceMaskPath, encodePngRgba8(opts.width, opts.height, protectRgba));
  const inpaintMaskPath = join(HYBRID_DIR, "inpaint-mask.png");
  writeFileSync(inpaintMaskPath, maskLToPng(inpaintMaskL, opts.width, opts.height));

  const lighting = loadRgb(lightingPath);
  const intensity = loadRgb(intensityPath);
  let faceRgb = lighting.rgb;
  if (lighting.width !== opts.width || lighting.height !== opts.height) {
    faceRgb = resizeRgbNearest(lighting.rgb, lighting.width, lighting.height, opts.width, opts.height);
  }
  const intensityRgb =
    intensity.width === opts.width && intensity.height === opts.height
      ? intensity.rgb
      : resizeRgbNearest(intensity.rgb, intensity.width, intensity.height, opts.width, opts.height);

  let initRgb = faceRgb;
  if (existsSync(SD_REFERENCE)) {
    const ref = loadRgb(SD_REFERENCE);
    initRgb =
      ref.width === opts.width && ref.height === opts.height
        ? ref.rgb
        : resizeRgbNearest(ref.rgb, ref.width, ref.height, opts.width, opts.height);
  }

  const sdStage = {
    stage: "sd_turbo_inpaint_surround",
    status: "blocked",
    endpoint: `${SD_URL}/sdapi/v1/img2img`,
    note: "not attempted",
  };
  let sdRgb = initRgb;
  let sdSurroundPath = null;

  const sdUp = await probeSdServer();
  if (sdUp) {
    try {
      const initPng = Buffer.from(
        encodePngRgba8(opts.width, opts.height, rgbToRgba(initRgb, opts.width, opts.height)),
      );
      const maskPng = readFileSync(inpaintMaskPath);
      const sdResult = await callSdInpaint(initPng, maskPng, opts);
      sdRgb =
        sdResult.width === opts.width && sdResult.height === opts.height
          ? sdResult.rgb
          : resizeRgbNearest(sdResult.rgb, sdResult.width, sdResult.height, opts.width, opts.height);
      sdSurroundPath = join(HYBRID_DIR, "sd-surround.png");
      writeFileSync(
        sdSurroundPath,
        encodePngRgba8(opts.width, opts.height, rgbToRgba(sdRgb, opts.width, opts.height)),
      );
      sdStage.status = "partial";
      sdStage.note = "SD-Turbo inpaint outside face mask; face protected by mask black region";
      sdStage.steps = opts.sdSteps;
      sdStage.cfgScale = opts.sdCfg;
      sdStage.denoisingStrength = opts.sdStrength;
    } catch (err) {
      sdStage.status = "blocked-with-evidence";
      sdStage.error = String(err.message || err).slice(0, 500);
      sdStage.note = "sd-server reachable but inpaint failed; composite uses HoloRT4D lighting only";
    }
  } else {
    sdStage.status = "blocked-with-evidence";
    sdStage.note = `sd-server unreachable at ${SD_URL}; composite uses HoloRT4D face + lighting init (no SD surround)`;
  }

  const compositeRgb = compositeHybrid(faceRgb, sdRgb, protectRgba, opts.width, opts.height);
  const compositePath = join(HYBRID_DIR, "composite.png");
  writeFileSync(
    compositePath,
    encodePngRgba8(opts.width, opts.height, rgbToRgba(compositeRgb, opts.width, opts.height)),
  );

  const provenance = {
    intent: "hybrid human frame — HoloRT4D trace-owned face, SD-Turbo surround when available",
    honest: {
      holort4dFace: "lighting-reference.png inside face mask — trace-owned, NOT SD",
      holort4dField: "field-intensity.png sibling for |E| comparison",
      sdTurboSurround: sdStage.status === "partial" ? "sd-surround.png outside face mask" : "did not run or blocked",
      glbAdapter: "declared — later only; not implemented this pass",
      photoreal: "partial — composite of debug field lighting + optional SD atmosphere",
    },
    faceZone: {
      source: "docs/holort4d/ART_DIRECTION_BRIEF.md §5",
      ellipse: faceZone,
      maskCoverage: (() => {
        let n = 0;
        for (let i = 3; i < protectRgba.length; i += 4) {
          if (protectRgba[i] > 127) n += 1;
        }
        return { protectedPixels: n, fraction: n / (opts.width * opts.height) };
      })(),
    },
    pipeline: {
      stages: [
        { stage: "holort4d_human_frame", status: opts.skipHolort4d ? "skipped" : "enforced" },
        { stage: "face_mask_ellipse", status: "partial" },
        sdStage,
        {
          stage: "composite_face_holort4d_surround_sd",
          status: sdStage.status === "partial" ? "partial" : "partial-holort4d-only",
        },
      ],
    },
    inputs: {
      holort4dLighting: lightingPath,
      holort4dIntensity: intensityPath,
      sdReference: existsSync(SD_REFERENCE) ? SD_REFERENCE : null,
    },
    outputs: {
      composite: compositePath,
      faceMask: faceMaskPath,
      inpaintMask: inpaintMaskPath,
      sdSurround: sdSurroundPath,
    },
    render: { width: opts.width, height: opts.height, seed: opts.seed, samples: opts.samples },
    sha256: {
      composite: sha256File(compositePath),
      faceMask: sha256File(faceMaskPath),
    },
  };
  if (sdSurroundPath) provenance.sha256.sdSurround = sha256File(sdSurroundPath);

  writeFileSync(join(HYBRID_DIR, "provenance.json"), JSON.stringify(provenance, null, 2));
  console.log(JSON.stringify({ ok: true, hybridDir: HYBRID_DIR, sdStage: sdStage.status, provenance: provenance.outputs }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
