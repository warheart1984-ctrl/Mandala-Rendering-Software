#!/usr/bin/env node
/**
 * Batch NIM FLUX shell image ingest (assist-only).
 *
 * Usage:
 *   node sovereign-x/cli/sx-flux-image-batch.mjs --dir ./stills --dry-run
 *   npm run sx:flux-image-batch -- --dir ./stills --out-dir ./out
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { route } from "../router/index.js";
import { GpuAssistModule } from "../router/modules/gpu/gpuAssistModule.js";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function printHelp() {
  console.log(`Usage: sx-flux-image-batch --dir <folder> [options]

Options:
  --dir <path>       Directory of images (required)
  --prompt <text>    Shared assist prompt
  --dry-run          Force stub (no NIM network)
  --out-dir <path>   Write per-image JSON results
  --help             Show help

STATUS: assistOnly — not Digital Printer SoT.
`);
}

function parseArgs(argv) {
  const out = {
    dir: null,
    prompt: null,
    dryRun: false,
    outDir: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--out-dir") out.outDir = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.dir) {
    console.error("error: --dir required");
    printHelp();
    process.exit(1);
  }

  const dir = resolve(args.dir);
  const files = readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort();

  if (args.outDir) mkdirSync(resolve(args.outDir), { recursive: true });

  const mod = new GpuAssistModule({ route });
  const summary = [];

  for (const file of files) {
    const imagePath = join(dir, file);
    const result = await mod.handleFluxImageIngest({
      intentId: `sx-flux-batch-${basename(file, extname(file))}`,
      modality: "image",
      mode: "lookdev-from-image",
      imagePath,
      prompt: args.prompt,
      dryRun: args.dryRun,
      assistOnly: true,
    });
    summary.push({
      file,
      ok: result.ok !== false,
      live: Boolean(result.live),
      code: result.code,
      assistOnly: true,
    });
    if (args.outDir) {
      const outPath = join(
        resolve(args.outDir),
        `${basename(file, extname(file))}.flux.json`,
      );
      writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
    }
  }

  console.log(
    JSON.stringify(
      {
        assistOnly: true,
        nonAuthoritative: true,
        dir,
        count: files.length,
        results: summary,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
