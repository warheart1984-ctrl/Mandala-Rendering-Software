#!/usr/bin/env node
/**
 * PGDS CLI — Photoreal Governance Dashboard (Node http).
 *
 * Usage:
 *   npm run mrs:photoreal-dashboard -- --base-dir tmp/blender-10s-test/governed-render --port 4000
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    baseDir: null,
    port: 4000,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-dir") out.baseDir = resolve(argv[++i]);
    else if (a === "--port") out.port = Number(argv[++i]) || 4000;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.baseDir) {
    console.log(
      "Usage: node scripts/photoreal-dashboard.mjs --base-dir <runs-parent> [--port 4000]",
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

  const { url, port, baseDir } = mod.createDashboardServer(
    args.baseDir,
    args.port,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        port,
        baseDir,
        endpoints: ["/api/runs", "/api/run/:id", "/"],
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
