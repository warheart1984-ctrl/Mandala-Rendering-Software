#!/usr/bin/env node
/**
 * Emit SPR/PEP/CEC for an existing governed-render / external-pbr run dir.
 * STATUS: **partial**
 *
 * Usage:
 *   node scripts/emit-photoreal-evidence.mjs --out-dir tmp/blender-10s-test/governed-render/587f836fc789a003
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

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
      "Usage: node scripts/emit-photoreal-evidence.mjs --out-dir <governed-run-dir>",
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

  const result = mod.emitPhotorealEvidenceFromRun({
    outDir: args.outDir,
    write: true,
  });
  const checklist = mod.runPhotorealPromotionChecklist({
    pep: result.pep,
    spr: result.spr,
    cec: result.cec,
    runDir: args.outDir,
  });
  writeFileSync(
    join(args.outDir, "photoreal-checklist-t01-t13.json"),
    JSON.stringify(checklist, null, 2),
  );
  // Backward-compatible alias for historical trails.
  writeFileSync(
    join(args.outDir, "photoreal-checklist-t01-t08.json"),
    JSON.stringify(checklist, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        paths: result.paths,
        completeness: result.completeness,
        checklistSummary: checklist.summary,
        tests: checklist.tests,
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
