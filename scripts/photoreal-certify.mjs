#!/usr/bin/env node
/**
 * CPCS CLI — Phase 4 Constitutional Photoreal Certification.
 * STATUS: **partial** — expect certified:false until all gates pass.
 *
 * Usage:
 *   npm run mrs:photoreal-certify -- --out-dir tmp/blender-10s-test/governed-render/587f836fc789a003
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { outDir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") out.outDir = resolve(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.outDir) {
    console.log(
      "Usage: node scripts/photoreal-certify.mjs --out-dir <governed-run-dir>",
    );
    process.exit(args.help ? 0 : 1);
  }

  const mod = await import(
    pathToFileURL(
      join(
        REPO,
        "mrs/packages/renderer-core/src/evidence/photoreal/index.js",
      ),
    ).href
  );

  const cpcs = mod.evaluateCertification({
    runDir: args.outDir,
    write: true,
  });

  console.log(JSON.stringify(cpcs, null, 2));
  process.exit(cpcs.certified ? 0 : 2);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
