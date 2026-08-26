#!/usr/bin/env node

/**

 * Face rig → 3-map Turbo control → SD-Turbo (Polar sd-server :13306).

 *

 * Turbo GGUF cannot read Float32Array blendshapes — only pixels.

 * Emits depth.png, topology.png, flow.png + CPF-4D snapshot + provenance.

 *

 * Usage:

 *   node scripts/face-rig-turbo.mjs [--width 512] [--height 512] [--skip-sd]
 *   node scripts/face-rig-turbo.mjs --photoreal [--sd-strength 0.65] [--output photoreal-v1.png]
 *   node scripts/face-rig-turbo.mjs --photoreal --init depth   # avoids topology number/color bleed
 *   node scripts/face-rig-turbo.mjs --color-portrait [--init prior|depth] [--sd-strength 0.55]
 *   node scripts/face-rig-turbo.mjs --view anime [--sd-model <gguf>] [--init depth|topology]
 *

 * Output: output/holort4d-human/face-rig-control/

 *   depth.png, topology.png, flow.png, rig-snapshot.json, turbo-output.png (if sd-server up), provenance.json

 *

 * Status: partial — 3-map render enforced; SD roundtrip requires sd-server @ :13306

 */



import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";



import { decodePngToRgb } from "../mandala/engine/png.mjs";

import {

  buildFaceRigEnvelopes,

  buildFaceRigSnapshot,

  createDefaultFaceRig,

  publishSnapshot,

  renderAllTurboControls,

  summarizeFaceRigState,

} from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";



const __dirname = dirname(fileURLToPath(import.meta.url));

const REPO = join(__dirname, "..");

const OUT_DIR = join(REPO, "output/holort4d-human/face-rig-control");

const PREVIEW_DIR = join(OUT_DIR, "preview");

const SD_URL = process.env.SD_SERVER_URL || "http://127.0.0.1:13306";



const SD_PROMPT =

  "cinematic portrait, warm key light high angle, cool fill shadow side, "

  + "realistic human face from control landmarks, dark neutral background, "

  + "contact shadow, restrained mood, head-shoulders crop";

const SD_NEGATIVE =

  "flat lighting, gray wash, text, watermark, numbers overlay, extra limbs, deformed face";

const PHOTOREAL_PROMPT =

  "RAW photo, 35mm portrait, natural skin pores, soft studio key light, cool shadow side, "

  + "hyperrealistic, 8k uhd, f/2.8, realistic human face, natural skin tones, "

  + "head-shoulders crop, dark neutral background, contact shadow";

const PHOTOREAL_NEGATIVE =

  "oil painting, illustration, cartoon, sepia, watercolor, plastic, blurry, deformed, "

  + "flat lighting, text, watermark, numbers overlay, extra limbs, canvas texture, airbrush";

const COLOR_PORTRAIT_PROMPT =

  "RAW photo, close-up portrait, warm natural skin, freckles, soft key light, photographic portrait, "

  + "cream beige tones, dark eyebrows, neutral lips, three-quarter view, shallow depth of field, "

  + "natural skin texture, pores, head-shoulders crop, soft studio lighting, f/2.8";

const COLOR_PORTRAIT_NEGATIVE =

  "grayscale, sketch, pencil, ink, illustration, monochrome, plastic, oil painting, cartoon, "

  + "watercolor, sepia wash, deformed, blurry, flat lighting, text, watermark, numbers overlay, extra limbs";

const ANIME_PROMPT =

  "anime, cel shading, toon ramp, large eyes, clean lineart";

const ANIME_NEGATIVE =

  "photoreal, grayscale, text, watermark, deformed, blurry, extra limbs, flat lighting";

const SD_MODEL = process.env.SD_MODEL ?? process.env.ANIME_GGUF ?? "SD-Turbo";

const PRIOR_PHOTOREAL = join(OUT_DIR, "photoreal-v3-fixed.png");

const HUMAN_PROVENANCE = join(REPO, "output/holort4d-human/provenance.json");



function parseArgs(argv) {

  const opts = {

    width: 512,

    height: 512,

    skipSd: false,

    photoreal: false,

    colorPortrait: false,

    sdSteps: 1,

    sdCfg: 1.0,

    sdStrength: 0.92,

    seed: 42,

    fieldId: "holort4d-face-rig-demo",

    output: null,

    initMap: "topology",

    view: "default",

    sdModel: SD_MODEL,

  };

  for (let i = 0; i < argv.length; i++) {

    const a = argv[i];

    if (a === "--width" && argv[i + 1]) opts.width = parseInt(argv[++i], 10);

    else if (a === "--height" && argv[i + 1]) opts.height = parseInt(argv[++i], 10);

    else if (a === "--seed" && argv[i + 1]) opts.seed = parseInt(argv[++i], 10);

    else if (a === "--sd-steps" && argv[i + 1]) opts.sdSteps = parseInt(argv[++i], 10);

    else if (a === "--sd-strength" && argv[i + 1]) opts.sdStrength = parseFloat(argv[++i]);

    else if (a === "--field-id" && argv[i + 1]) opts.fieldId = argv[++i];

    else if (a === "--output" && argv[i + 1]) opts.output = argv[++i];

    else if (a === "--init" && argv[i + 1]) opts.initMap = argv[++i];

    else if (a === "--view" && argv[i + 1]) opts.view = argv[++i];

    else if (a === "--sd-model" && argv[i + 1]) opts.sdModel = argv[++i];

    else if (a === "--photoreal") {

      opts.photoreal = true;

      opts.sdSteps = 4;

      opts.sdStrength = 0.65;

    }

    else if (a === "--color-portrait") {

      opts.colorPortrait = true;

      opts.sdSteps = 4;

      opts.sdStrength = 0.55;

      opts.initMap = "prior";

    }

    else if (a === "--skip-sd") opts.skipSd = true;

  }

  if (opts.view === "anime") {

    opts.sdSteps = 4;

    opts.sdStrength = 0.85;

    if (opts.initMap === "topology") opts.initMap = "depth";

  }

  return opts;

}



function loadHumanPromptHint() {

  if (!existsSync(HUMAN_PROVENANCE)) return null;

  try {

    const prov = JSON.parse(readFileSync(HUMAN_PROVENANCE, "utf8"));

    const hint = prov?.visuals?.prompt || prov?.sd?.prompt;

    return typeof hint === "string" && hint.trim() ? hint.trim() : null;

  } catch {

    return null;

  }

}



function sdPrompts(opts) {

  if (opts.view === "anime") {

    return { prompt: ANIME_PROMPT, negative: ANIME_NEGATIVE };

  }

  if (opts.colorPortrait) {

    const humanHint = loadHumanPromptHint();

    const prompt = humanHint

      ? `${COLOR_PORTRAIT_PROMPT}, ${humanHint}`

      : COLOR_PORTRAIT_PROMPT;

    return { prompt, negative: COLOR_PORTRAIT_NEGATIVE };

  }

  if (opts.photoreal) {

    return { prompt: PHOTOREAL_PROMPT, negative: PHOTOREAL_NEGATIVE };

  }

  return { prompt: SD_PROMPT, negative: SD_NEGATIVE };

}



function resolveInitPng(opts, maps) {

  if (opts.initMap === "depth") return { png: maps.depth.png, label: "depth.png" };

  if (opts.initMap === "topology") return { png: maps.topology.png, label: "topology.png" };

  if (opts.initMap === "prior" || opts.initMap === "photoreal") {

    if (existsSync(PRIOR_PHOTOREAL)) {

      return { png: readFileSync(PRIOR_PHOTOREAL), label: "photoreal-v3-fixed.png" };

    }

    return { png: maps.depth.png, label: "depth.png (prior missing)" };

  }

  return { png: maps.topology.png, label: "topology.png" };

}



async function probeSdServer() {

  try {

    const r = await fetch(`${SD_URL}/sdapi/v1/options`, { signal: AbortSignal.timeout(3000) });

    return r.ok;

  } catch {

    return false;

  }

}



async function callSdImg2img(controlPng, opts) {

  const url = `${SD_URL}/sdapi/v1/img2img`;

  const { prompt, negative } = sdPrompts(opts);

  const body = {

    init_images: [controlPng.toString("base64")],

    prompt,

    negative_prompt: negative,

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

  return Buffer.from(encoded, "base64");

}



async function main() {

  const opts = parseArgs(process.argv.slice(2));

  mkdirSync(OUT_DIR, { recursive: true });

  mkdirSync(PREVIEW_DIR, { recursive: true });



  const rig = createDefaultFaceRig(opts.fieldId);

  const maps = renderAllTurboControls(rig, opts.width, opts.height);

  const snapshot = buildFaceRigSnapshot(rig, opts.width, opts.height, maps.state);

  const envelopes = buildFaceRigEnvelopes(rig, {

    width: opts.width,

    height: opts.height,

    rigState: maps.state,

    depthHash: maps.depth.controlHash,

    topologyHash: maps.topology.controlHash,

    flowHash: maps.flow.controlHash,

    controlHash: maps.topology.controlHash,

    briefId: "holort4d-face-rig",

    waveFieldId: opts.fieldId,

  });



  const depthPath = join(OUT_DIR, "depth.png");

  const topologyPath = join(OUT_DIR, "topology.png");

  const flowPath = join(OUT_DIR, "flow.png");

  writeFileSync(depthPath, maps.depth.png);

  writeFileSync(topologyPath, maps.topology.png);

  writeFileSync(flowPath, maps.flow.png);

  writeFileSync(join(OUT_DIR, "control-image.png"), maps.topology.png);

  writeFileSync(join(PREVIEW_DIR, "depth.png"), maps.depth.png);

  writeFileSync(join(PREVIEW_DIR, "topology.png"), maps.topology.png);

  writeFileSync(join(PREVIEW_DIR, "flow.png"), maps.flow.png);

  writeFileSync(join(PREVIEW_DIR, "control-image.png"), maps.topology.png);



  const snapshotPath = join(OUT_DIR, "rig-snapshot.json");

  writeFileSync(

    snapshotPath,

    JSON.stringify(

      {

        snapshot: {

          kind: snapshot.kind,

          fieldId: snapshot.fieldId,

          width: snapshot.width,

          height: snapshot.height,

          meaning: snapshot.meaning,

          floatCount: snapshot.data.length,

          dataHash: envelopes.rigHash,

          metadata: snapshot.metadata,

        },

        faceRigState: summarizeFaceRigState(maps.state),

        canonical: envelopes.canonical,

        cpf4d: envelopes.cpf4d,

      },

      null,

      2,

    ),

  );



  const sdStage = { status: "declared", url: SD_URL, note: "skipped via --skip-sd", initImage: `${opts.initMap}.png` };

  let turboPath = null;



  if (!opts.skipSd) {

    const up = await probeSdServer();

    if (up) {

      try {

        const { png: initPng, label: initLabel } = resolveInitPng(opts, maps);

        const turboPng = await callSdImg2img(initPng, opts);

        const outName = opts.output

          || (opts.view === "anime" ? "anime-output.png"

            : opts.colorPortrait ? "color-portrait-output.png"

            : opts.photoreal ? "photoreal-output.png" : "turbo-output.png");

        turboPath = join(OUT_DIR, outName);

        writeFileSync(turboPath, turboPng);

        writeFileSync(join(PREVIEW_DIR, outName), turboPng);

        decodePngToRgb(turboPng);

        sdStage.status = "partial";

        sdStage.mode = opts.view === "anime" ? "anime"

          : opts.colorPortrait ? "color-portrait"

          : opts.photoreal ? "photoreal" : "cinematic";

        sdStage.initImage = initLabel;

        const { prompt, negative } = sdPrompts(opts);

        sdStage.prompt = prompt;

        sdStage.negative = negative;

        sdStage.note = `${sdStage.mode} img2img from ${initLabel} strength=${opts.sdStrength} steps=${opts.sdSteps} cfg=${opts.sdCfg} model=${opts.sdModel}`;

        envelopes.provenance.pipeline.sdTurbo = opts.colorPortrait ? "partial-color-portrait"

          : opts.photoreal ? "partial-photoreal" : "partial";

        envelopes.provenance.sdRan = true;

      } catch (err) {

        sdStage.status = "blocked";

        sdStage.error = String(err.message || err);

        sdStage.note = "sd-server reachable but img2img failed";

      }

    } else {

      sdStage.status = "blocked";

      sdStage.note = `sd-server unreachable at ${SD_URL}; control maps only`;

    }

  }



  const bridgeResult = await publishSnapshot(null, snapshot, {

    tryChamberBridge: false,

    provenance: envelopes.provenance,

    image: `data:image/png;base64,${maps.topology.png.toString("base64")}`,

    question: "Face rig 3-map control — depth + bone topology + optical flow",

  });



  const provenance = {

    ...envelopes.provenance,

    outputs: {

      depth: depthPath,

      topology: topologyPath,

      flow: flowPath,

      rigSnapshot: snapshotPath,

      turboOutput: turboPath,

      previewDir: PREVIEW_DIR,

    },

    controlHashes: {

      depth: maps.depth.controlHash,

      topology: maps.topology.controlHash,

      flow: maps.flow.controlHash,

    },

    sd: sdStage,

    visionBridge: bridgeResult,

    honest: {

      prior: "2D orthographic project(x,y) with z dropped — topology debug, NOT a rig",

      now: "3-map rig: depth.png (z grayscale) + topology.png (bone colors) + flow.png (optical flow)",

      holort4d: "face-rig-cpf4d-snapshot + PathSample.opticalLength from flow",

      sdTurbo: sdStage.status === "partial" ? "img2img-from-topology" : "did-not-run",

      photoreal: opts.photoreal

        ? (sdStage.status === "partial" ? "partial — lower strength + photo prompts; not commercial grade" : "blocked")

        : "not-claimed",

      colorPortrait: opts.colorPortrait

        ? (sdStage.status === "partial"

          ? "partial — warm color skin from prior grayscale bust; not target freckle close-up"

          : "blocked")

        : "not-claimed",

      anime: opts.view === "anime"

        ? (sdStage.status === "partial"

          ? "partial — anime img2img from depth+topology controls; swap GGUF via SD_MODEL / --sd-model"

          : "blocked")

        : "not-claimed",

      controlNet: "declared — depth→Depth, topology→OpenPose/Tile (see FACE_RIG_TURBO_CONTROL.md)",

    },

    secondPass: {

      status: "declared",

      note: "Feed turbo-output radiance+weight prior into PathSample — not implemented in this pass",

    },

  };



  writeFileSync(join(OUT_DIR, "provenance.json"), JSON.stringify(provenance, null, 2));



  console.log(JSON.stringify({

    ok: true,

    outDir: OUT_DIR,

    depth: depthPath,

    topology: topologyPath,

    flow: flowPath,

    hashes: provenance.controlHashes,

    rigSnapshot: snapshotPath,

    turboOutput: turboPath,

    sd: sdStage.status,

  }, null, 2));

}



main().catch((err) => {

  console.error(err);

  process.exit(1);

});


