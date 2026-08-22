#!/usr/bin/env node
/**
 * Full-body human pipeline — HoloRT4D lighting + capsule body maps + SD-Turbo color portrait.
 *
 * Pipeline:
 *   holort4d-human-frame.mjs --fullbody → lighting-reference + field-intensity
 *   holort4d-human-body-maps.mjs → depth.png + topology.png (capsule skeleton)
 *   SD-Turbo img2img (depth or lighting init) → fullbody-color.png
 *
 * Usage:
 *   node scripts/holort4d-human-fullbody.mjs [--width 512] [--height 512] [--skip-holort4d] [--skip-sd]
 *   node scripts/holort4d-human-fullbody.mjs --init depth|lighting|txt2img [--sd-strength 0.58]
 *
 * Output: output/holort4d-human/fullbody/
 * Status: partial — capsule geometry, SD-Turbo diffusion; not commercial photoreal.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { decodePngToRgb } from "../mandala/engine/png.mjs";
import { encodePngRgba8 } from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";
import { renderBodyControlMaps } from "./holort4d-human-body-maps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "output/holort4d-human/fullbody");
const PREVIEW_DIR = join(OUT_DIR, "preview");
const SD_REFERENCE = join(REPO, "output/holort4d-human/human.png");
const COLOR_FACE_PRIOR = join(REPO, "output/holort4d-human/face-rig-control/color-portrait-best.png");
const SD_URL = process.env.SD_SERVER_URL || "http://127.0.0.1:13306";

const FULLBODY_PROMPT =
  "full body portrait, standing figure, head to toe visible, cinematic warm key light high angle, "
  + "cool fill shadow side, warm natural skin, dark neutral background, contact shadow on ground plane, "
  + "restrained mood, photographic, full length shot, feet visible";

const FULLBODY_NEGATIVE =
  "cropped, head only, bust only, missing legs, missing feet, cut off, flat lighting, gray wash, "
  + "text, watermark, numbers overlay, extra limbs, deformed, cartoon, illustration";

const COLOR_FULLBODY_PROMPT =
  "RAW photo, full body portrait standing, head to toe, warm natural skin, soft cinematic key light, "
  + "cool shadow side, cream beige skin tones, dark neutral background, contact shadow, full length, "
  + "photographic, f/4, natural skin texture";

const COLOR_FULLBODY_NEGATIVE =
  "cropped, bust, headshot, missing feet, grayscale, sketch, illustration, cartoon, plastic, "
  + "flat lighting, text, watermark, numbers overlay, extra limbs, deformed";

function parseArgs(argv) {
  const opts = {
    width: 512,
    height: 512,
    samples: 8,
    seed: 42,
    skipHolort4d: false,
    skipSd: false,
    colorPortrait: true,
    sdSteps: 4,
    sdCfg: 1.0,
    sdStrength: 0.58,
    initMode: "lighting",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);
    else if (a === "--samples" && argv[i + 1]) opts.samples = parseInt(argv[++i], 10);
    else if (a === "--seed" && argv[i + 1]) opts.seed = parseInt(argv[++i], 10);
    else if (a === "--sd-steps" && argv[i + 1]) opts.sdSteps = parseInt(argv[++i], 10);
    else if (a === "--sd-strength" && argv[i + 1]) opts.sdStrength = parseFloat(argv[++i]);
    else if (a === "--init" && argv[i + 1]) opts.initMode = argv[++i];
    else if (a === "--skip-holort4d") opts.skipHolort4d = true;
    else if (a === "--skip-sd") opts.skipSd = true;
    else if (a === "--no-color-portrait") opts.colorPortrait = false;
  }
  return opts;
}

function sha256(bufOrPath) {
  const data = Buffer.isBuffer(bufOrPath) ? bufOrPath : readFileSync(bufOrPath);
  return createHash("sha256").update(data).digest("hex");
}

function runHolort4dFrame(opts) {
  const script = join(REPO, "scripts/holort4d-human-frame.mjs");
  const args = [
    script,
    "--fullbody",
    "--width", String(opts.width),
    "--height", String(opts.height),
    "--samples", String(opts.samples),
    "--seed", String(opts.seed),
    "--out", "output/holort4d-human/fullbody",
  ];
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`holort4d-human-frame --fullbody failed: ${r.stderr || r.stdout}`);
  }
}

async function probeSdServer() {
  try {
    const r = await fetch(`${SD_URL}/sdapi/v1/options`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

function sdPrompts(opts) {
  if (opts.colorPortrait) {
    return { prompt: COLOR_FULLBODY_PROMPT, negative: COLOR_FULLBODY_NEGATIVE };
  }
  return { prompt: FULLBODY_PROMPT, negative: FULLBODY_NEGATIVE };
}

function resolveInitImage(opts) {
  const lightingPath = join(OUT_DIR, "lighting-reference.png");
  const depthPath = join(OUT_DIR, "depth.png");

  if (opts.initMode === "lighting" && existsSync(lightingPath)) {
    return { png: readFileSync(lightingPath), label: "lighting-reference.png" };
  }
  if (opts.initMode === "prior" && existsSync(SD_REFERENCE)) {
    return { png: readFileSync(SD_REFERENCE), label: "human.png (SD reference)" };
  }
  if (opts.initMode === "face-prior" && existsSync(COLOR_FACE_PRIOR)) {
    return { png: readFileSync(COLOR_FACE_PRIOR), label: "color-portrait-best.png" };
  }
  if (existsSync(depthPath)) {
    return { png: readFileSync(depthPath), label: "depth.png" };
  }
  if (existsSync(lightingPath)) {
    return { png: readFileSync(lightingPath), label: "lighting-reference.png (depth missing)" };
  }
  return null;
}

async function callSdImg2img(initPng, opts) {
  const { prompt, negative } = sdPrompts(opts);
  const body = {
    init_images: [initPng.toString("base64")],
    prompt,
    negative_prompt: negative,
    width: opts.width,
    height: opts.height,
    steps: opts.sdSteps,
    cfg_scale: opts.cfgScale ?? opts.sdCfg,
    denoising_strength: opts.sdStrength,
    seed: opts.seed,
    batch_size: 1,
  };
  const r = await fetch(`${SD_URL}/sdapi/v1/img2img`, {
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
  return Buffer.from(encoded, "base64");
}

async function callSdTxt2img(opts) {
  const { prompt, negative } = sdPrompts(opts);
  const body = {
    prompt,
    negative_prompt: negative,
    width: opts.width,
    height: opts.height,
    steps: opts.sdSteps,
    cfg_scale: opts.sdCfg,
    seed: opts.seed,
    batch_size: 1,
  };
  const r = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`sd-server txt2img ${r.status}: ${text.slice(0, 400)}`);
  }
  const payload = await r.json();
  const encoded = payload.images?.[0];
  if (!encoded) throw new Error("sd-server returned no images");
  return Buffer.from(encoded, "base64");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PREVIEW_DIR, { recursive: true });

  const holoStage = { stage: "holort4d_fullbody_frame", status: opts.skipHolort4d ? "skipped" : "enforced" };
  if (!opts.skipHolort4d) {
    runHolort4dFrame(opts);
  }

  const bodyMaps = renderBodyControlMaps({ width: opts.width, height: opts.height });
  const depthPath = join(OUT_DIR, "depth.png");
  const topologyPath = join(OUT_DIR, "topology.png");
  writeFileSync(depthPath, bodyMaps.depth.png);
  writeFileSync(topologyPath, bodyMaps.topology.png);
  writeFileSync(join(PREVIEW_DIR, "depth.png"), bodyMaps.depth.png);
  writeFileSync(join(PREVIEW_DIR, "topology.png"), bodyMaps.topology.png);

  const lightingPath = join(OUT_DIR, "lighting-reference.png");
  const intensityPath = join(OUT_DIR, "field-intensity.png");
  const holort4dOk = existsSync(lightingPath);

  const sdStage = {
    stage: "sd_turbo_fullbody",
    status: "declared",
    endpoint: SD_URL,
    note: "skipped via --skip-sd",
    initMode: opts.initMode,
  };
  let fullbodyColorPath = null;

  if (!opts.skipSd) {
    const up = await probeSdServer();
    if (up) {
      try {
        let turboPng;
        if (opts.initMode === "txt2img") {
          turboPng = await callSdTxt2img(opts);
          sdStage.mode = opts.colorPortrait ? "color-fullbody-txt2img" : "fullbody-txt2img";
          sdStage.initImage = null;
        } else {
          const init = resolveInitImage(opts);
          if (!init) throw new Error("no init image for img2img");
          turboPng = await callSdImg2img(init.png, opts);
          sdStage.mode = opts.colorPortrait ? "color-fullbody-img2img" : "fullbody-img2img";
          sdStage.initImage = init.label;
        }
        fullbodyColorPath = join(OUT_DIR, "fullbody-color.png");
        writeFileSync(fullbodyColorPath, turboPng);
        writeFileSync(join(PREVIEW_DIR, "fullbody-color.png"), turboPng);
        decodePngToRgb(turboPng);
        const { prompt, negative } = sdPrompts(opts);
        sdStage.status = "partial";
        sdStage.prompt = prompt;
        sdStage.negative = negative;
        sdStage.steps = opts.sdSteps;
        sdStage.denoisingStrength = opts.sdStrength;
        sdStage.note = `${sdStage.mode} strength=${opts.sdStrength} steps=${opts.sdSteps}`;
      } catch (err) {
        sdStage.status = "blocked-with-evidence";
        sdStage.error = String(err.message || err).slice(0, 500);
        sdStage.note = "sd-server reachable but generation failed";
      }
    } else {
      sdStage.status = "blocked-with-evidence";
      sdStage.note = `sd-server unreachable at ${SD_URL}`;
    }
  }

  const provenance = {
    intent: "full-body human portrait — HoloRT4D lighting + capsule maps + SD-Turbo color",
    honest: {
      holort4d: holort4dOk
        ? "lighting-reference + field-intensity from traced capsule humanoid — NOT SD"
        : "holort4d stage skipped or failed",
      geometry: "partial — capsule ragdoll (humanoid-avatar.mjs), head cluster + limbs, NOT GLB mesh",
      bodyMaps: "partial — ray-traced depth + joint topology skeleton; not FACS face rig at full length",
      sdTurbo: sdStage.status === "partial"
        ? "fullbody-color.png from SD-Turbo — diffusion, not governed wave optics"
        : sdStage.status,
      photoreal: sdStage.status === "partial"
        ? "partial — SD-Turbo 512² on RX 580; cinematic lighting target, not commercial grade"
        : "not-claimed",
      colorPortrait: opts.colorPortrait
        ? (sdStage.status === "partial" ? "partial — warm full-body color from depth/lighting init" : "blocked")
        : "not-claimed",
    },
    artDirection: {
      brief: "docs/holort4d/ART_DIRECTION_BRIEF.md",
      key: "directional warm [1.0, 0.96, 0.9] intensity 2.4, high angle",
      fill: "directional cool [0.55, 0.65, 0.85] intensity 0.35",
      ground: "Hyperplane y=0 contact shadow",
      exposure: "2.2× after integrate (holort4d-human-frame)",
    },
    camera: {
      mode: "fullbody",
      preset: "CAMERA_PRESETS.fullbody in holort4d-human-face.mjs",
      note: "pulled back z=-4.6, look-at y=0.52, baseY=0.42 — feet on ground, head to feet in 512²",
      jointPixels: bodyMaps.jointPixels,
    },
    pipeline: {
      stages: [
        holoStage,
        { stage: "body_depth_topology_maps", status: "partial", module: "holort4d-human-body-maps.mjs" },
        sdStage,
      ],
    },
    inputs: {
      sdReference: existsSync(SD_REFERENCE) ? SD_REFERENCE : null,
      colorFacePrior: existsSync(COLOR_FACE_PRIOR) ? COLOR_FACE_PRIOR : null,
    },
    outputs: {
      lightingReference: holort4dOk ? lightingPath : null,
      fieldIntensity: existsSync(intensityPath) ? intensityPath : null,
      depth: depthPath,
      topology: topologyPath,
      fullbodyColor: fullbodyColorPath,
      previewDir: PREVIEW_DIR,
    },
    render: {
      width: opts.width,
      height: opts.height,
      samples: opts.samples,
      seed: opts.seed,
    },
    sha256: {
      depth: sha256(depthPath),
      topology: sha256(topologyPath),
    },
  };
  if (holort4dOk) provenance.sha256.lightingReference = sha256(lightingPath);
  if (existsSync(intensityPath)) provenance.sha256.fieldIntensity = sha256(intensityPath);
  if (fullbodyColorPath) provenance.sha256.fullbodyColor = sha256(fullbodyColorPath);

  writeFileSync(join(OUT_DIR, "provenance.json"), JSON.stringify(provenance, null, 2));

  console.log(JSON.stringify({
    ok: true,
    outDir: OUT_DIR,
    holort4d: holoStage.status,
    sd: sdStage.status,
    outputs: provenance.outputs,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
