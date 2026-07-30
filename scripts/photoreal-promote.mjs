#!/usr/bin/env node
/**
 * Phase-3 photoreal promote CLI (partial).
 *
 * Usage:
 *   npm run mrs:photoreal-promote -- --out-dir tmp/governed-render/<runId>
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { outDir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir") out.outDir = resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.outDir) {
    console.log(
      "Usage: node scripts/photoreal-promote.mjs --out-dir <governed-run-dir>",
    );
    process.exit(args.help ? 0 : 1);
  }

  const mod = await import(
    pathToFileURL(
      join(
        REPO,
        "mrs/packages/renderer-core/src/evidence/photoreal/index.js",
      ),
    ).href,
  );

  const result = mod.runPhotorealPromotionPipeline({
    outDir: args.outDir,
    write: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: result.outDir,
        files: {
          fpec: join(result.outDir, "fpec.json"),
          checklist: join(result.outDir, "photoreal-checklist-t01-t13.json"),
          rdc: join(result.outDir, "rdc.json"),
          cat: join(result.outDir, "cat-phr.json"),
          cpcs: join(result.outDir, "cpcs.json"),
        },
        metrics: {
          pep: result.fpec.scores.pep,
          spr: result.fpec.scores.spr,
          eligibilityScore: result.fpec.eligibilityScore,
          governanceDecision: result.fpec.governanceDecision,
          certified: result.cpcs.certified,
          certificationLevel: result.cpcs.certificationLevel,
          failedGates: result.cpcs.failedGates,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
