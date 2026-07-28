#!/usr/bin/env node
/**
 * demo-storyforge-to-4d.mjs — thin wrapper → Python demo_full_run.py
 *
 * STATUS: **enforced** (host Node + Python boundary execute)
 * Usage:
 *   node scripts/demo-storyforge-to-4d.mjs
 *   node scripts/demo-storyforge-to-4d.mjs -- --genblaze-smoke
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const DEMO = join(
  REPO,
  "mrs",
  "adapters",
  "storyforge-boundary",
  "demo_full_run.py",
);

function findPython() {
  const env = process.env.MRS_PYTHON || process.env.PYTHON;
  if (env && existsSync(env)) return env;
  for (const cand of ["python", "python3", "py"]) {
    const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cand;
  }
  return null;
}

function main(argv = process.argv.slice(2)) {
  if (!existsSync(DEMO)) {
    process.stderr.write(`missing demo: ${DEMO}\n`);
    process.exit(1);
  }
  const py = findPython();
  if (!py) {
    process.stderr.write("python not found (set MRS_PYTHON)\n");
    process.exit(1);
  }
  const forwarded = argv[0] === "--" ? argv.slice(1) : argv;
  const r = spawnSync(py, [DEMO, ...forwarded], {
    cwd: REPO,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

main();
