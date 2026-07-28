#!/usr/bin/env node
/**
 * Face Creation Assist CLI (assist-only).
 *
 * Usage:
 *   node sovereign-x/cli/sx-face-creation.mjs --prompt "hero face" [--dry-run]
 *   node sovereign-x/cli/sx-face-creation.mjs --image ./ref.png --dry-run
 *   npm run sx:face-creation -- --prompt "..." --dry-run
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runFaceCreationAssist } from "../integrations/genblaze/modes/faceCreationAssist.js";

function printHelp() {
  console.log(`Usage: sx-face-creation [options]

Options:
  --prompt <text>      Character / face assist prompt
  --image <path>       Optional reference still (FLUX lookdev-from-image)
  --image-b64 <b64>    Inline base64 image
  --dry-run            Force FLUX stub (no NIM network)
  --out <json>         Write result JSON
  --help               Show help

STATUS: assistOnly — never Digital Printer SoT.
`);
}

function parseArgs(argv) {
  const out = {
    prompt: null,
    imagePath: null,
    imageBase64: null,
    dryRun: false,
    outPath: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--image") out.imagePath = argv[++i];
    else if (a === "--image-b64") out.imageBase64 = argv[++i];
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

  const result = await runFaceCreationAssist({
    intentId: `face-assist-${Date.now()}`,
    modality: "image",
    prompt: args.prompt || "face creation assist draft",
    imagePath: args.imagePath ? resolve(args.imagePath) : undefined,
    imageBase64: args.imageBase64 || undefined,
    dryRun: args.dryRun,
    mode:
      args.imagePath || args.imageBase64
        ? "lookdev-from-image"
        : "face-creation-assist",
    assistOnly: true,
  });

  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (args.outPath) {
    writeFileSync(resolve(args.outPath), json, "utf8");
    console.error(`wrote ${args.outPath}`);
  }

  if (result?.ok === false && result?.code === "FACE_CREATION_PRINT_SOT_DENIED") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
