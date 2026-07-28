#!/usr/bin/env node
/**
 * bake-draft-lattice-plate.mjs — optional pre-bake draft lattice / star plate.
 *
 * STATUS: **partial** (structure still via Engine3D; polish skipped without FAL)
 * Trail: docs/governance/cecp/trails/judge-wow-2026-07/
 *
 * Wraps render-engine3d-still.mjs (or create4dStarWorld still path).
 * When FAL keys are missing, exits 0 with polish:skipped (honest gap).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const ENGINE3D_ROOT = join(PKG_ROOT, "..", "engine3d-core");
const STILL_SCRIPT = join(ENGINE3D_ROOT, "scripts", "render-engine3d-still.mjs");

const USAGE = `bake-draft-lattice-plate.mjs — STATUS: partial

Usage:
  node scripts/bake-draft-lattice-plate.mjs --help
  node scripts/bake-draft-lattice-plate.mjs --demo [--out-dir <dir>] [--width N] [--height N]
  node scripts/bake-draft-lattice-plate.mjs --star-demo [--out-dir <dir>]
  node scripts/bake-draft-lattice-plate.mjs --world <Engine3DWorldDocument.json> [--out-dir <dir>]

Renders Engine3D soft-raster structure plate (beauty+AOVs).
If FAL_KEY / FAL_API_KEY absent → polish:skipped, exit 0 (no diffusion bake).
`;

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--demo") out.demo = true;
    else if (a === "--star-demo") out["star-demo"] = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function hasFalKey() {
  return Boolean(
    (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim(),
  );
}

async function writeStarWorld(outPath, seed) {
  const dist = join(ENGINE3D_ROOT, "dist", "src", "world", "StarWorld.js");
  if (!existsSync(dist)) {
    throw new Error(
      `engine3d-core StarWorld missing: ${dist}. Run npm run build in engine3d-core`,
    );
  }
  const { create4dStarWorld } = await import(pathToFileURL(dist).href);
  const world = create4dStarWorld({
    seed: seed >>> 0,
    armCount: 8,
    includeHalo: true,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(world, null, 2) + "\n");
  return outPath;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const outDir =
    typeof args["out-dir"] === "string"
      ? resolve(String(args["out-dir"]))
      : resolve(process.cwd(), "output/bake-draft-lattice-plate");
  mkdirSync(outDir, { recursive: true });

  const width = Math.max(16, parseInt(String(args.width ?? 256), 10) || 256);
  const height = Math.max(16, parseInt(String(args.height ?? 256), 10) || 256);
  const seed = parseInt(String(args.seed ?? "7"), 10) >>> 0;

  let worldPath =
    typeof args.world === "string" ? resolve(String(args.world)) : null;

  if (args["star-demo"] || (!worldPath && (args.demo || true))) {
    if (args["star-demo"] || args.demo || !worldPath) {
      worldPath = join(outDir, "star-world.json");
      await writeStarWorld(worldPath, seed);
    }
  }

  if (!existsSync(STILL_SCRIPT)) {
    process.stderr.write(
      `bake-draft-lattice-plate: missing ${STILL_SCRIPT}\n`,
    );
    process.exit(2);
  }

  const childArgs = [
    STILL_SCRIPT,
    "--engine3d-still",
    "--out-dir",
    outDir,
    "--width",
    String(width),
    "--height",
    String(height),
    "--aov",
    "depth,normal",
  ];
  if (worldPath && existsSync(worldPath)) {
    childArgs.push("--world", worldPath);
  }

  const result = spawnSync(process.execPath, childArgs, {
    encoding: "utf8",
    cwd: ENGINE3D_ROOT,
    env: { ...process.env, ENGINE3D_STILL: "1" },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  const polish = hasFalKey()
    ? { polish: "declared", note: "FAL key present but polish bake not wired in this shell" }
    : { polish: "skipped", note: "FAL_KEY / FAL_API_KEY absent — structure plate only" };

  const summary = {
    ok: true,
    status: "partial",
    outDir,
    worldPath,
    ...polish,
  };
  writeFileSync(join(outDir, "bake-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
