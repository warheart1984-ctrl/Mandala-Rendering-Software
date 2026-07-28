#!/usr/bin/env node
/**
 * judge-wow-proton-triptych.mjs — dense star→proton beauty+depth+normal.
 *
 * STATUS: **enforced**
 * Trail: docs/governance/cecp/trails/judge-wow-2026-07/
 *
 * Opinionated wrapper around render-proton-splat --star-demo.
 * Default 256; pass --width 512 for larger judge plates.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPLAT = join(__dirname, "render-proton-splat.mjs");

const USAGE = `judge-wow-proton-triptych.mjs — STATUS: enforced

Usage:
  node scripts/judge-wow-proton-triptych.mjs --help
  node scripts/judge-wow-proton-triptych.mjs [--width 256|512] [--height N] [--out-dir <dir>] [--seed N]

Runs dense create4dStarWorld → proton six-mod → beauty.png + depth.png + normal.png + evidence.json
Resolution target: 256–512 inclusive (default 256).
`;

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function clampWow(n, fallback) {
  const v = parseInt(String(n ?? fallback), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(256, Math.min(512, v));
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const width = clampWow(args.width, 256);
  const height = clampWow(args.height ?? args.width, width);
  const outDir =
    typeof args["out-dir"] === "string" || typeof args["output-dir"] === "string"
      ? resolve(String(args["out-dir"] ?? args["output-dir"]))
      : resolve(process.cwd(), "output/judge-wow-proton-triptych");
  const seed = args.seed != null ? String(args.seed) : "42";

  const childArgs = [
    SPLAT,
    "--star-demo",
    "--width",
    String(width),
    "--height",
    String(height),
    "--out-dir",
    outDir,
    "--aov",
    "depth,normal",
    "--seed",
    seed,
  ];

  const result = spawnSync(process.execPath, childArgs, {
    encoding: "utf8",
    cwd: join(__dirname, ".."),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

main();
