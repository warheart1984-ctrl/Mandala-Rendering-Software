#!/usr/bin/env node
/**
 * Sovereign X — NIM FLUX shell image ingest CLI (assist-only).
 *
 * Usage:
 *   node sovereign-x/cli/sx-flux-image.mjs --image ./still.png [--prompt "..."] [--dry-run]
 *   npm run sx:flux-image -- --image ./still.png --dry-run
 *
 * Drive-G-1: never print SoT. Missing key → stub (exit 0 with live:false).
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { route } from "../router/index.js";
import { LookDevEngine } from "../router/modules/gpu/assist/lookDevEngine.js";
import { GpuAssistModule } from "../router/modules/gpu/gpuAssistModule.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function printHelp() {
  console.log(`Usage: sx-flux-image --image <path> [options]

Options:
  --image <path>       Shell / reference image path (required unless --image-b64)
  --image-b64 <b64>    Inline base64 image
  --prompt <text>      Assist prompt (optional)
  --dry-run            Force stub (no NIM network)
  --out <json>         Write result JSON
  --engine             Use LookDevEngine.runFromImage (includes draft SceneSpec)
  --help               Show help

Env:
  NVIDIA_API_KEY / NVIDIA_NIM_API_KEY / NGC_API_KEY
  NIM_FLUX_ENDPOINT or NVIDIA_GEN_BASE_URL + GENBLAZE_IMAGE_MODEL

STATUS: assistOnly — not Digital Printer SoT.
`);
}

function parseArgs(argv) {
  const out = {
    imagePath: null,
    imageBase64: null,
    prompt: null,
    dryRun: false,
    outPath: null,
    engine: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--engine") out.engine = true;
    else if (a === "--image") out.imagePath = argv[++i];
    else if (a === "--image-b64") out.imageBase64 = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--out") out.outPath = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.imagePath && !args.imageBase64) {
    console.error("error: --image or --image-b64 required");
    printHelp();
    process.exit(1);
  }

  const request = {
    intentId: `sx-flux-${Date.now()}`,
    modality: "image",
    mode: "lookdev-from-image",
    imagePath: args.imagePath ? resolve(args.imagePath) : undefined,
    imageBase64: args.imageBase64 || undefined,
    prompt: args.prompt || undefined,
    dryRun: args.dryRun,
    assistOnly: true,
  };

  let result;
  if (args.engine) {
    const engine = new LookDevEngine({ route });
    result = await engine.runFromImage(request);
  } else {
    const mod = new GpuAssistModule({ route });
    result = await mod.handleFluxImageIngest(request);
  }

  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (args.outPath) {
    writeFileSync(resolve(args.outPath), json, "utf8");
    console.error(`wrote ${args.outPath}`);
  }

  // Non-zero only on hard failures that aren't honest stubs
  if (result?.ok === false && result?.code === "MISSING_IMAGE") process.exit(1);
  if (result?.ok === false && result?.code === "IMAGE_NOT_FOUND") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
