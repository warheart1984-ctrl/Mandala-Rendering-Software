#!/usr/bin/env node
/**
 * RCS CLI — Renderer Conformance Suite (partial).
 *
 * Usage:
 *   npm run mrs:photoreal-rcs -- --base-dir tmp/rcs-runs --run-dir tmp/blender-10s-test/governed-render/587f836fc789a003
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    baseDir: null,
    runDirs: [],
    promote: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-dir") out.baseDir = resolve(argv[++i]);
    else if (a === "--run-dir") out.runDirs.push(resolve(argv[++i]));
    else if (a === "--no-promote") out.promote = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.baseDir) {
    console.log(`Usage: node scripts/photoreal-rcs.mjs --base-dir <out>
  [--run-dir <governed-run>]... [--no-promote]`);
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

  let runDirs = args.runDirs;
  if (!runDirs.length) {
    runDirs = mod.discoverDefaultRunDirs(REPO);
  }

  const summary = mod.runConformanceSuite({
    baseDir: args.baseDir,
    repoRoot: REPO,
    runDirs,
    promote: args.promote,
    write: true,
  });

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.conformanceLevel === "FULL_CONFORMANCE" ? 0 : 2);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
