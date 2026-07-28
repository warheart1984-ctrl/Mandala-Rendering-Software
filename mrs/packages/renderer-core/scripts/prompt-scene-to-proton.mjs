#!/usr/bin/env node
/**
 * prompt-scene-to-proton.mjs — SceneSpecification → proton AOVs one-shot.
 *
 * STATUS: **enforced** (scene-spec → proton pipeline)
 * Trail: docs/governance/cecp/trails/judge-wow-2026-07/
 *
 * Accepts --scene-spec (required) and shells the same pipeline as
 * render-proton-splat with AOVs. Prompt→Scene generation is OOP via
 * prompt-scene-bridge; this CLI does not embed Genblaze narrative lanes.
 *
 * Gap: Genblaze HTTP flag for prompt→proton one-shot remains CLI-only
 * (use POST /api/prompt-to-scene then this script, or --scene-spec).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import { mintCir } from "../../../adapters/proton-raster-bridge/mintCir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTON_INDEX = pathToFileURL(
  join(__dirname, "../src/render/rt4d/proton/index.js"),
).href;

const USAGE = `prompt-scene-to-proton.mjs — STATUS: enforced

Usage:
  node scripts/prompt-scene-to-proton.mjs --help
  node scripts/prompt-scene-to-proton.mjs --scene-spec <path.json> \\
    [--width 256|512] [--height N] [--out-dir <dir>] [--seed <s>]

Pipeline: SceneSpecification JSON → runProtonPipeline → beauty/depth/normal + evidence.json
Resolution default 256 (allow 512). intentId minted via CIR overlay.

Gap: prompt string → SceneSpecification is out-of-process (prompt-scene-bridge /
Genblaze POST /api/prompt-to-scene). This CLI requires --scene-spec.
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

function clampDim(raw, fallback) {
  const n = parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(n) || n < 8) return fallback;
  return Math.min(1024, n);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const scenePath =
    typeof args["scene-spec"] === "string"
      ? resolve(String(args["scene-spec"]))
      : typeof args.scene === "string"
        ? resolve(String(args.scene))
        : null;
  if (!scenePath || !existsSync(scenePath)) {
    process.stderr.write(
      "prompt-scene-to-proton: --scene-spec <path.json> required\n",
    );
    process.exit(2);
  }

  const width = clampDim(args.width, 256);
  const height = clampDim(args.height, width);
  const outDir =
    typeof args["out-dir"] === "string"
      ? resolve(String(args["out-dir"]))
      : resolve(process.cwd(), "output/prompt-scene-to-proton");

  const proton = await import(PROTON_INDEX);
  const { runProtonPipeline, encodeDepthPng, encodeNormalPng } = proton;
  const sceneSpec = JSON.parse(readFileSync(scenePath, "utf8"));
  const cir = mintCir({
    seed: args.seed ?? `prompt-scene-${scenePath}`,
    goal: "prompt-scene-to-proton",
    actor: "mrs.prompt-scene-to-proton",
  });

  const result = runProtonPipeline(sceneSpec, {
    intentId: cir.id,
    width,
    height,
    cir,
  });

  mkdirSync(outDir, { recursive: true });
  const beautyPath = join(outDir, "beauty.png");
  const depthPath = join(outDir, "depth.png");
  const normalPath = join(outDir, "normal.png");
  writeFileSync(beautyPath, result.image.png);
  writeFileSync(depthPath, encodeDepthPng(result.depth));
  writeFileSync(normalPath, encodeNormalPng(result.normals));

  const evidence = {
    ...result.evidence,
    intentId: cir.id,
    sceneSpecPath: scenePath,
    beautyPath,
    depthPath,
    normalPath,
    status: "enforced",
  };
  const evidencePath = join(outDir, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        status: "enforced",
        outDir,
        beautyPath,
        depthPath,
        normalPath,
        evidencePath,
        protonCount: result.field.protons.length,
        evidence,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
