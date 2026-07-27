#!/usr/bin/env node
/**
 * operator-face-install.mjs — copy a face GLB into operator-assets/human/
 * and validate rigged assets via validate:face-glb.
 *
 * Usage (repo root):
 *   npm run operator:face-install -- path/to/HumanFaceRigged.glb
 *   npm run operator:face-install -- path/to/HumanFaceNeutral.glb
 *
 * Env:
 *   OPERATOR_ASSETS_ROOT — override operator root (default ./operator-assets
 *   relative to repo root).
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

function operatorRoot() {
  const raw = process.env.OPERATOR_ASSETS_ROOT?.trim() || "./operator-assets";
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(REPO_ROOT, raw);
}

/**
 * Map source basename → stable logical filename.
 * Accepts HumanFaceRigged.glb / HumanFaceNeutral.glb or paths whose name
 * contains Rigged / Neutral.
 */
function logicalTargetName(srcPath) {
  const base = basename(srcPath);
  const lower = base.toLowerCase();
  if (lower === "humanfacerigged.glb" || /rigged/i.test(base)) {
    return "HumanFaceRigged.glb";
  }
  if (lower === "humanfaceneutral.glb" || /neutral/i.test(base)) {
    return "HumanFaceNeutral.glb";
  }
  return null;
}

function main() {
  const srcArg = process.argv[2];
  if (!srcArg) {
    process.stderr.write(
      "Usage: npm run operator:face-install -- <path/to/HumanFaceRigged.glb|HumanFaceNeutral.glb>\n",
    );
    process.exit(1);
  }

  const src = resolve(srcArg);
  if (!existsSync(src)) {
    process.stderr.write(`operator-face-install: file not found: ${src}\n`);
    process.exit(1);
  }

  const targetName = logicalTargetName(src);
  if (!targetName) {
    process.stderr.write(
      "operator-face-install: expected HumanFaceRigged.glb or HumanFaceNeutral.glb " +
        "(or a basename containing Rigged/Neutral).\n",
    );
    process.exit(1);
  }

  const destDir = join(operatorRoot(), "human");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, targetName);
  copyFileSync(src, dest);
  process.stdout.write(`Installed ${dest}\n`);

  if (!/rigged/i.test(targetName)) {
    process.stdout.write(
      "Neutral mesh installed (no bone/blendshape validation).\n",
    );
    return;
  }

  const result = spawnSync(
    "npm",
    ["run", "validate:face-glb", "--", dest],
    {
      cwd: join(REPO_ROOT, "mrs", "packages", "engine3d-core"),
      stdio: "inherit",
      shell: true,
      env: process.env,
    },
  );
  if ((result.status ?? 1) !== 0) {
    process.stderr.write(
      "operator-face-install: validate:face-glb failed (file was still copied).\n",
    );
    process.exit(result.status ?? 1);
  }
}

main();
